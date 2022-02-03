/* eslint-disable no-shadow,camelcase */
const axios = require('axios');
const functions = require('firebase-functions');
const { Storage } = require('@google-cloud/storage');
const FormData = require('form-data');
const { pubsub } = require('./pubsub');
const logger = require('./winston');
const { admin } = require('./admin');
const { url } = require('./constants');

const storage = new Storage();
const bucketName = 'yba-shirts.appspot.com';
const bucket = storage.bucket(bucketName);

const { username } = functions.config().deconet;
const { password } = functions.config().deconet;
const productionStatus = 1; // 1 = Order Placed, 2 = Produced, 3 = Shipped
const decoURL = `http://www.shirtyourself.secure-decoration.com/api/json/manage_orders/find?conditions[1][field]=4&conditions[1][condition]=1&conditions[1][string]=${productionStatus}&limit=10&offset=0&sortby=1&include_workflow_data=1&include_po_data=1&include_shipments=1&include_production_file_info=1&skip_login_token=1&username=${username}&password=${password}`;
// const deltaURL = `https://sandbox.dtg2goportal.com/api/v1/workorders`; // Sandbox
// const deltaURL = `https://www.dtg2goportal.com/api/v1/workorders`; // Production
// const deltaApiKey = `AB909D6C79252F0CCBC65870D1B89B40`; // SandBox
// const deltaApiKey = functions.config().deconet.deltaapikey; // Production

const ORDER_DESK_URL = 'https://app.orderdesk.me/api/v2/orders';
const { store_id, api_key } = functions.config().orderdesk;

const convertDateToSQL = (d) => {
  const date = new Date(d);
  return `${date.toISOString().split('T')[0]} ${date.toTimeString().split(' ')[0]}`;
};

const getApiKey = () => {
  return admin
    .auth()
    .createCustomToken(functions.config().fire.uid)
    .catch((err) => {
      throw err;
    });
};

const translate = async () => {
  const data = await axios({
    method: 'get',
    url: decoURL,
  })
    .then(({ data }) => data)
    .catch((err) => {
      logger.error('Error retrieving orders', { error: err.response.data });
    });
  const apiToken = await getApiKey();
  const workOrders = await Promise.all(
    data.orders.map(async (order) => {
      const { order_lines: orderLines } = order;
      const costs = await Promise.all(
        orderLines.map(async (line) => {
          const { product_id: productId, fields, qty } = line;
          const sku = fields?.[0]?.options?.[0]?.sku;
          if (sku) {
            const { product } = await axios({
              method: 'get',
              url: `http://www.shirtyourself.secure-decoration.com/api/json/manage_products/get?username=${username}&password=${password}&id=${productId}`,
            }).then(({ data }) => data);
            const { skus, supplier } = product;
            const { cost } = skus.find((s) => s.sku === sku);
            const vendor = await axios({
              method: 'get',
              url: `${url}/vendors/getByName/${supplier}`,
              headers: {
                apiToken,
              },
            }).then(({ data }) => data);
            return { notes: sku, perUnit: cost, totalQuantity: qty, totalEstimatedCost: cost * qty, vendorID: vendor.id };
          }
          return { notes: `couldn't find sku` };
        }),
      );
      // const byuOrders = costs.filter(({ notes }) => notes.includes('BYU'));
      // if (byuOrders.length) {
      //   const totalByuCost = byuOrders.reduce((total, { totalEstimatedCost }) => total + totalEstimatedCost, 0);
      //   const royalty = totalByuCost / 0.86 - totalByuCost;
      //   costs.push({ notes: 'BYU Royalty', totalQuantity: 1, perUnit: royalty, totalEstimatedCost: royalty });
      // }
      return {
        workOrderID: `SY-${order.order_id}`,
        customerName: 'YBA Web Store',
        invoiceDate: convertDateToSQL(order.date_ordered),
        customerID: 5201,
        orderType: 'webOrder',
        salesType: 'E-Commerce',
        costAndInvoiceComplete: 1,
        salesApproved: 1,
        productionComplete: 1,
        cspCostReviewed: 1,
        sales: [
          { userID: 'UH18T05Z9AOEYx6JzZ4TdJis1ME3', assignedCommission: 1 },
          { userID: 'coar4DwAoedBjf9yg0rsrYtCWZG2', assignedCommission: 0 },
        ],
        orderProcessors: [{ uid: 'e6TVCt6Z7lhomXrofdSndXJI5Dk2' }],
        contacts: [
          {
            address1: order.billing_details.street,
            address2: '',
            city: order.billing_details.city,
            zip: order.billing_details.postcode,
            state: {},
            country: {},
            co: `${order.billing_details.firstname} ${order.billing_details.lastname}`,
            email: order.billing_details.email,
            phone: order.billing_details.ph_number,
            organization: order.billing_details.company,
            type: 'billing',
          },
        ],
        costs,
        invoices: order.order_lines.map((line) => ({
          unitPrice: line.unit_price,
          quantity: line.qty,
          bill: line.total_price,
          type: line.product_name,
        })),
      };
    }),
  );

  const sendToMSAS = (w) => {
    return pubsub.topic(`create_work_order_prod`).publish(Buffer.from(JSON.stringify(w)));
  };

  const sendToOrderDesk = (o) => {
    return axios({
      method: 'post',
      url: ORDER_DESK_URL,
      data: o,
      headers: { 'ORDERDESK-STORE-ID': store_id, 'ORDERDESK-API-KEY': api_key },
    })
      .then(({ data }) => data)
      .catch((err) => {
        logger.error("Couldn't place Order Desk Order", { err, o });
        if (err?.response?.data?.errors) {
          throw err.response.data.errors;
        }
        throw err;
      });
  };

  const updateDeco = (orderId, newStatus, shippingCode, contactCustomer) => {
    const form = new FormData();
    form.append('username', username);
    form.append('password', password);
    form.append('order_id', orderId);
    form.append('new_status', newStatus);
    if (shippingCode) {
      form.append('shipping_code', shippingCode);
    }
    if (contactCustomer) {
      form.append('contact_customer', contactCustomer);
    }
    return axios({
      method: 'post',
      url: 'http://www.shirtyourself.secure-decoration.com/api/json/manage_orders/update_order_status',
      data: form,
      headers: form.getHeaders(),
    });
  };

  const decoToGoogle = async (u, fileName) => {
    const url = `${u}&skip_login_token=1&username=${username}&password=${password}`;
    return new Promise((res, rej) => {
      try {
        axios({ method: 'get', url, responseType: 'stream' }).then(({ data }) => {
          const file = bucket.file(fileName);
          const stream = file
            .createWriteStream()
            .on('error', (err) => {
              throw err;
            })
            .on('finish', async () => {
              await file.makePublic();
              res(file.publicUrl());
            });
          data.pipe(stream);
        });
      } catch (err) {
        rej(err);
      }
    });
  };

  await Promise.all(workOrders.map(sendToMSAS));

  const orderDeskOrders = await Promise.all(
    data.orders.map(async (order) => {
      const { billing_details, shipping_details, taxes } = order;
      const tax_total = taxes[0].amount;
      const { email } = billing_details;

      let shipping = {
        first_name: billing_details.firstname,
        last_name: billing_details.lastname,
        company: billing_details.company,
        address1: billing_details.street,
        address2: '',
        city: billing_details.city,
        state: billing_details.state,
        postal_code: billing_details.postcode,
        country: billing_details.country_code,
        phone: billing_details.ph_number,
      };

      if (shipping_details) {
        shipping = {
          first_name: shipping_details.firstname,
          last_name: shipping_details.lastname,
          company: shipping_details.company,
          address1: shipping_details.street,
          address2: '',
          city: shipping_details.city,
          state: shipping_details.state,
          postal_code: shipping_details.postcode,
          country: shipping_details.country_code,
          phone: shipping_details.ph_number,
        };
      }

      const customer = {
        first_name: billing_details.firstname,
        last_name: billing_details.lastname,
        company: billing_details.company,
        address1: billing_details.street,
        address2: '',
        city: billing_details.city,
        state: billing_details.state,
        postal_code: billing_details.postcode,
        country: billing_details.country_code,
        phone: billing_details.ph_number,
      };
      const orderItems = await Promise.all(
        order.order_lines
          .filter((o) => o.views.find((v) => v.areas.find((a) => a.processes.find((p) => p.process === 'DTG'))))
          .map(async (line) => {
            const frontView = line.views.find((v) => v.view_name === 'Front');
            const frontArea = frontView?.areas.find((a) => a.area_name === 'Classic - Front');
            const frontMockUp = `https://shirtyourself.com${frontView.thumbnail}`;
            let frontDesign = frontArea?.processes[0].production_file_url;
            const backView = line.views.find((v) => v.view_name === 'Back');
            const backArea = backView?.areas.find((a) => a.area_name === 'Classic - Back');
            const backMockUp = `https://shirtyourself.com${backView?.thumbnail}`;
            let backDesign = backArea?.processes[0].production_file_url;
            if (frontDesign) {
              frontDesign = await decoToGoogle(
                frontDesign,
                `shirt-yourself/${order.order_id}/${line.id}/${frontArea.area_name}-mockup.${frontArea.processes[0].format}`,
              );
            }
            if (backDesign) {
              backDesign = await decoToGoogle(
                backDesign,
                `shirt-yourself/${order.order_id}/${line.id}/${backArea.area_name}-mockup.${backArea.processes[0].format}`,
              );
            }
            const { unit_price, qty: q } = line;
            const price = unit_price * q;
            const skus = line.fields[0]?.options?.map((o) => ({ sku: o.sku, qty: o.qty, size: o.name }));
            return skus?.map(({ sku, qty, size }) => {
              const o = {
                // id: '42286',
                name: line.product_name,
                price,
                quantity: qty,
                // weight: 1,
                code: sku,
                delivery_type: 'ship',
                category_code: 'DEFAULT',
                variation_list: {
                  Size: size,
                  Color: line.product_color.name,
                },
                metadata: {
                  print_sku: sku,
                },
              };
              if (frontDesign) {
                o.metadata.print_preview_1 = frontMockUp;
                o.metadata.print_url_1 = frontDesign;
                o.metadata.print_location_1 = 'Front';
                o.metadata.print_height_1 = 349.25;
                o.metadata.print_width_1 = 495.3;
              }
              if (backDesign) {
                o.metadata.print_preview_2 = backMockUp;
                o.metadata.print_url_2 = backDesign;
                o.metadata.print_location_2 = 'Back';
                o.metadata.print_height_2 = 349.25;
                o.metadata.print_width_2 = 495.3;
              }
              return o;
            });
          }),
      );
      return { source_id: `SY-${order.order_id}`, email, shipping, customer, tax_total, order_items: orderItems.flat() };
    }),
  );

  logger.info('Order Desk Orders', orderDeskOrders);

  const orderDeskResults = await Promise.allSettled(orderDeskOrders.map(sendToOrderDesk));
  if (orderDeskResults.length) {
    logger.info('Order Desk Order Status', orderDeskResults);
  }

  return { orderDeskResults, workOrders };
};

exports.getDecoOrders = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('0 * * * *')
  .timeZone('America/Denver')
  .onRun(translate);

exports.translate = translate;

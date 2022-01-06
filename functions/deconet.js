/* eslint-disable no-shadow */
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
const deltaURL = `https://www.dtg2goportal.com/api/v1/workorders`; // Production
// const deltaApiKey = `AB909D6C79252F0CCBC65870D1B89B40`; // SandBox
const deltaApiKey = functions.config().deconet.deltaapikey; // Production

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
        sales: [{ userID: 'UH18T05Z9AOEYx6JzZ4TdJis1ME3', assignedCommission: 1 }],
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

  const sendToDelta = (o) => {
    return axios({ method: 'post', url: deltaURL, data: o, headers: { apikey: deltaApiKey } })
      .then(({ data }) => data)
      .catch((err) => {
        logger.error("Couldn't place Delta Order", { err, o });
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

  const deltaOrders = await Promise.all(
    data.orders.map((order) => {
      return Promise.all(
        order.order_lines
          .filter((o) => o.views.find((v) => v.areas.find((a) => a.processes.find((p) => p.process === 'DTG'))))
          .map(async (line) => {
            const frontView = line.views.find((v) => v.view_name === 'Front');
            const frontArea = frontView.areas.find((a) => a.area_name === 'Body');
            const frontMockUp = `https://shirtyourself.com${frontView.thumbnail}`;
            let frontDesign = frontArea.processes[0].production_file_url;
            const backView = line.views.find((v) => v.view_name === 'Back');
            const backArea = backView?.areas.find((a) => a.area_name === 'Back');
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
            const skus = line.fields[0]?.options?.map((o) => ({ sku: o.sku, qty: o.qty }));
            return skus?.map(({ sku, qty }) => {
              const shippingDetails = {
                to_name: `${order.billing_details.firstname} ${order.billing_details.lastname}`,
                to_address: order.billing_details.street,
                to_city: order.billing_details.city,
                to_state: order.billing_details.state,
                to_zip: order.billing_details.postcode,
                to_country: order.billing_details.country_code,
                to_phone: order.billing_details.ph_number,
              };
              if (order.shipping_details) {
                shippingDetails.to_name = `${order.shipping_details.firstname} ${order.shipping_details.lastname}`;
                shippingDetails.to_address = order.shipping_details.street;
                shippingDetails.to_city = order.shipping_details.city;
                shippingDetails.to_state = order.shipping_details.state;
                shippingDetails.to_zip = order.shipping_details.postcode;
                shippingDetails.to_country = order.shipping_details.country_code;
                shippingDetails.to_phone = order.shipping_details.ph_number;
              }
              const o = {
                merchant_order_id: `SY-${order.order_id}-${line.id}-${sku}`,
                merchant_custom_1: `SY-${order.order_id}`,
                product_name: line.product_name,
                merchant_sku: line.product_code,
                ...shippingDetails,
                designs: [],
                variations: [
                  {
                    delta_sku: sku,
                    quantities: [
                      {
                        quantity: qty,
                      },
                    ],
                  },
                ],
              };
              if (frontDesign) {
                o.front_image = {
                  url: frontMockUp,
                };
                o.designs.push({
                  position: 'Front',
                  underbase: 'on',
                  media: {
                    url: frontDesign,
                  },
                });
              }
              if (backDesign) {
                o.back_image = {
                  url: backMockUp,
                };
                o.designs.push({
                  position: 'Back',
                  underbase: 'on',
                  media: {
                    url: backDesign,
                  },
                });
              }
              if (!o.front_image) {
                o.front_image = {
                  url: 'https://firebasestorage.googleapis.com/v0/b/yba-shirts.appspot.com/o/Screen%20Shot%202019-10-24%20at%201.45.48%20PM.png?alt=media&token=8c2a2860-3387-4c2b-a194-b814c2206a08',
                };
              }
              if (!o.back_image) {
                o.back_image = {
                  url: 'https://firebasestorage.googleapis.com/v0/b/yba-shirts.appspot.com/o/Screen%20Shot%202019-10-24%20at%201.45.48%20PM.png?alt=media&token=8c2a2860-3387-4c2b-a194-b814c2206a08',
                };
              }
              logger.info('Delta Order', o);
              return o;
            });
          })
          .flat(),
      );
    }),
  );

  const filteredDeltaOrders = deltaOrders
    .flat()
    .flat()
    .filter((o) => o);

  const deltaResults = await Promise.allSettled(filteredDeltaOrders.map(sendToDelta));

  if (deltaResults.length) {
    logger.info('Delta Order Status', deltaResults);
  }
  return { deltaResults, workOrders };
};

exports.getDecoOrders = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('0 * * * *')
  .timeZone('America/Denver')
  .onRun(translate);

exports.translate = translate;

/**
 * Responds to any HTTP request.
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */

const puppeteer = require('puppeteer');
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const bucketName = 'yba-shirts.appspot.com';
const bucket = storage.bucket(bucketName);

exports.generatePDF = async (req, res) => {
  const { fileName, link } = req.body;

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('https://portal.ybashirts.com/', {
      waitUntil: 'networkidle0',
    });
    await page.type('#email', process.env.PUPPET_EMAIL);
    await page.type('#password', process.env.PUPPET_PASS);
    await page.click('#signIn', {
      waitUntil: 'networkidle0',
    });
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        page
          .goto(`https://portal.ybashirts.com/${link}`, {
            waitUntil: 'networkidle0',
          })
          .then(() => {
            resolve();
          })
          .catch((err) => {
            reject(err);
          });
      }, 2000);
    });
    await page.emulateMedia('screen');
    setTimeout(async () => {
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
      });
      await browser.close();
      const file = bucket.file(fileName);
      await file
        .createWriteStream()
        .on('error', (err) => {
          throw err;
        })
        .on('finish', async () => {
          await file.makePublic();
        })
        .end(pdf);
      res.send('PDF Created!');
    }, 2000);
  } catch (err) {
    res.status(500).send(err);
  }
};

// exports.generatePDF = async (req, res) => {
//     const { fileName, link } = req.body;
//     const puppeteer = require('puppeteer');

//     try {
//         const browser = await puppeteer.launch({args: ['--no-sandbox']});
//         const page = await browser.newPage();
//         await page.setViewport({ width: 1920, height: 1080 });
//         await page.goto("https://portal.ybashirts.com", {waitUntil: 'networkidle0'});
//         await page.type('#email', process.env.PUPPET_EMAIL);
//         await page.type('#password', process.env.PUPPET_PASS);
//         await page.click('#signIn', {
//             waitUntil: 'networkidle0'
//         })
//         await page.goto(`https://portal.ybashirts.com/${link}`, {waitUntil: 'networkidle0'});
//         // await page.emulateMedia('screen');
//         let pdf;
//         await new Promise((resolve, reject) => {
//             setTimeout(async () => {
//                 pdf = await page.pdf({
//                     format: 'A4',
//                     landscape: true,
//                     printBackground: true,
//                 }).then(() => resolve()).catch((err) => reject(err));
//             }, 2000);
//           });
//         browser.close();
//         const file = bucket.file(fileName);
//         await file
//             .createWriteStream()
//             .on('error', (err) => {
//                 throw err;
//             })
//             .on('finish', async () => {
//                 console.log(`Created: ${fileName}`);
//                 await file.makePublic();
//                 res.send('Created NESPDF');
//             })
//             .end(pdf)
//     } catch (err) {
//         res.status(500).send(err);
//     }};

#!/usr/bin/env node
const puppeteer  = require('puppeteer');
const express    = require('express');
const bodyParser = require('body-parser');
const tmp        = require('tmp');

const launcherSettings = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
};

const app = express();
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

const router = express.Router();
router.post('/screenshot', function(req, res) {
    (async () => {
        puppeteer
            .launch(launcherSettings)
            .then(async browser => {
                console.log('Generating screenshot');

                const tmpobj  = tmp.dirSync();
                const tmpFile = tmpobj.name + '/screenshot.png';

                const page = await browser.newPage();
                if (req.body.html) {
                    await page.setContent(req.body.html, {
                       waitUntil: 'networkidle2',
                    });
                } else {
                    await page.goto(req.body.url, {
                        waitUntil: 'networkidle2',
                    });
                }

                await page.setViewport({
                    width:  req.body.options.width || 1500,
                    height: req.body.options.height || 1000
                });

                if (req.body.options.selector) {
                    const element = await page.$(req.body.options.selector);
                    await element.screenshot({
                        path: tmpFile,
                        fullPage: true
                    });
                } else {
                    await page.screenshot({
                        path: tmpFile,
                        fullPage: true,
                        printBackground: true
                    });
                }
                await browser.close();

                res.sendFile(tmpFile, {}, function() {
                    tmpobj.removeCallback();
                });
            })
            .catch((err) => {
                res.status(500);
                res.send(err.message);
            })
    })();
});

router.post('/pdf', function(req, res) {
    (async () => {
        puppeteer
            .launch(launcherSettings)
            .then(async browser => {
                console.log('Generating PDF', req.body.options);

                const tmpobj  = tmp.dirSync();
                const tmpFile = tmpobj.name + '/page.pdf';

                const page = await browser.newPage();
                if (req.body.html) {
                    await page.setContent(req.body.html);
                } else {
                    await page.goto(req.body.url);
                }

                await page.setViewport({
                    width:  req.body.options.width || 1500,
                    height: req.body.options.height || 1000
                });

                await page.pdf({
                    path:   tmpFile,
                    format: req.body.options.format || 'Letter',
                    printBackground: true
                });
                await browser.close();

                res.sendFile(tmpFile, {}, function() {
                    tmpobj.removeCallback();
                });
            })
            .catch((err) => {
                res.status(500);
                res.send(err.message);
            })
    })();
});

router.post('/html', function(req, res) {
    (async () => {
        puppeteer
            .launch(launcherSettings)
            .then(async browser => {
                console.log('Generating html');

                const page = await browser.newPage();
                if (req.body.html) {
                    await page.setContent(req.body.html, {
                        waitUntil: 'networkidle2',
                    });
                } else {
                    await page.goto(req.body.url, {
                        waitUntil: 'networkidle2',
                    });
                }

                setTimeout(async () => {
                    let bodyHTML = await page.content();
                    await browser.close();

                    res.send(bodyHTML);
                }, req.body.options.wait || 1000);
            })
            .catch((err) => {
                res.status(500);
                res.send(err.message);
            })
    })();
});

app.use('/', router);

const port   = process.env.PORT || 8080;
const server = app.listen(port);
console.log('Listing on port ' + port);

process.on('SIGTERM', function() {
    server.close();
});
process.on('SIGINT', function() {
    server.close();
});

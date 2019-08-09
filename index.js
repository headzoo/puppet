#!/usr/bin/env node
const puppeteer  = require('puppeteer');
const express    = require('express');
const bodyParser = require('body-parser');
const tmp        = require('tmp');
const fs         = require('fs');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const router = express.Router();
router.post('/screenshot', function(req, res) {
    (async () => {
        puppeteer.launch()
            .then(async browser => {
                console.log('Generating screenshot');

                const tmpobj  = tmp.dirSync();
                const tmpFile = tmpobj.name + '/screenshot.png';

                const page = await browser.newPage();
                if (req.body.html) {
                    await page.setContent(req.body.html);
                } else {
                    await page.goto(req.body.url);
                }

                const element = await page.$(req.body.selector);
                await element.screenshot({
                    path: tmpFile
                });
                await browser.close();

                fs.readFile(tmpFile, null, function(err, data) {
                    tmpobj.removeCallback();

                    res.set('Content-Type', 'image/png');
                    res.send(data);
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
        puppeteer.launch()
            .then(async browser => {
                console.log('Generating PDF');

                const tmpobj  = tmp.dirSync();
                const tmpFile = tmpobj.name + '/page.pdf';

                const page = await browser.newPage();
                if (req.body.html) {
                    await page.setContent(req.body.html);
                } else {
                    await page.goto(req.body.url);
                }
                await page.pdf({
                    path:   tmpFile,
                    format: req.body.format,
                    printBackground: true
                });
                await browser.close();

                fs.readFile(tmpFile, null, function(err, data) {
                    tmpobj.removeCallback();

                    res.set('Content-Type', 'application/pdf');
                    res.send(data);
                });
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

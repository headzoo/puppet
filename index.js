#!/usr/bin/env node
const puppeteer  = require('puppeteer');
const express    = require('express');
const bodyParser = require('body-parser');
const tmp        = require('tmp');
const fs         = require('fs');

const launcherSettings = {
    headless: true,
    ignoreHTTPSErrors: true,
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
                const { body } = req;
                const { options } = body;

                console.log('Generating screenshot', options);

                const page = await browser.newPage();
                if (body.html) {
                    await page.setContent(body.html, {
                       waitUntil: 'networkidle2',
                    });
                } else {
                    await page.goto(body.url, {
                        waitUntil: 'networkidle2',
                    });
                }

                await page.setDefaultNavigationTimeout(0);
                if (!options.fullPage) {
                    await page.setViewport({
                        width:  options.width || 1500,
                        height: options.height || 1500
                    });
                }

                if (options.selectors) {
                    const images   = {};
                    const promises = [];
                    options.selectors.forEach(async (selector) => {
                        promises.push(new Promise(async (resolve) => {
                            let data = null;
                            const element = await page.$(selector);
                            if (element) {
                                const tmpobj  = tmp.dirSync();
                                const tmpFile = tmpobj.name + '/screenshot.png';
                                await element.screenshot({
                                    path: tmpFile
                                });
                                data = fs.readFileSync(tmpFile).toString('base64');
                                await tmpobj.removeCallback();
                            }

                            images[selector] = data;
                            resolve();
                        }));
                    });

                    Promise.all(promises)
                        .then(async () => {
                            await browser.close();
                            res.json(images);
                        });
                } else {
                    const tmpobj  = tmp.dirSync();
                    const tmpFile = tmpobj.name + '/screenshot.png';

                    if (options.selector) {
                        const element = await page.$(options.selector);
                        await element.screenshot({
                            path: tmpFile
                        });
                    } else {
                        const opts = {
                            path: tmpFile,
                            printBackground: true
                        };
                        if (options.fullPage) {
                            opts.fullPage = true;
                        } else {
                            opts.clip = {
                                x:      0,
                                y:      0,
                                width:  options.width || 1500,
                                height: options.height || 1500
                            }
                        }
                        await page.screenshot(opts);
                    }
                    await browser.close();

                    res.sendFile(tmpFile, {}, function() {
                        tmpobj.removeCallback();
                    });
                }
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

router.post('/ping', function(req, res) {
    (async () => {
        puppeteer
            .launch(launcherSettings)
            .then(async browser => {
                console.log('Pinging');

                const start = (new Date().getTime()) / 1000;
                const page = await browser.newPage();
                if (req.body.html) {
                    await page.setContent(req.body.html, {
                        waitUntil: 'networkidle0',
                    });
                } else {
                    await page.goto(req.body.url, {
                        waitUntil: 'networkidle0',
                    });
                }

                const end   = ((new Date().getTime() - 500) / 1000); // networkidle0 adds 500 ms
                const total = (end - start);

                await browser.close();
                res.send(total.toString());
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

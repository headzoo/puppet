#!/usr/bin/env node
const puppeteer  = require('puppeteer');
const express    = require('express');
const bodyParser = require('body-parser');
const tmp        = require('tmp');
const fs         = require('fs');

const launcherSettings = {
    headless:          true,
    ignoreHTTPSErrors: true,
    defaultViewport:   null,
    args:              ["--no-sandbox", "--disable-setuid-sandbox"]
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
                const { body }    = req;
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
                            try {
                                let data      = null;
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
                            } catch (error) {
                                console.error(error);
                                resolve();
                            }
                        }));
                    });

                    Promise.all(promises)
                        .then(async () => {
                            await browser.close();
                            res.json(images);
                        })
                        .catch((error) => {
                            console.log(error);
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
                            path:            tmpFile,
                            type:            'jpeg',
                            quality:         60,
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

router.post('/scrape', function(req, res) {
    (async () => {
        puppeteer
            .launch(launcherSettings)
            .then(async browser => {
                console.log('Scraping page');

                const { body }    = req;
                const { options } = body;

                const page = await browser.newPage();
                page.on('console', consoleObj => console.log(consoleObj.text()));

                if (req.body.html) {
                    await page.setContent(req.body.html, {
                        waitUntil: 'networkidle2',
                    });
                } else {
                    await page.goto(req.body.url, {
                        waitUntil: 'networkidle2',
                    });
                }

                await page.setDefaultNavigationTimeout(0);
                if (!options.fullPage) {
                    await page.setViewport({
                        width:  parseInt(options.width || 1500, 10),
                        height: parseInt(options.height || 1500, 10)
                    });
                }

                await page.addScriptTag({
                    url: 'https://ajax.googleapis.com/ajax/libs/jquery/1.8.2/jquery.min.js'
                });

                await page.evaluate(() => {
                    const style = document.createElement('style');
                    style.innerText = `
                        .be-code-edit {
                            font-family: monospace;
                            font-size: 34px;
                            width: 100%;
                            white-space: pre;
                            height: auto;
                        }
                    `;
                    const head = document.querySelector('head');
                    if (head) {
                        head.appendChild(style);
                    }
                    document.querySelectorAll('.be-code-edit')
                        .forEach((element) => {
                            element.innerHTML = element.innerText.trim();
                        });

                    document
                        .querySelectorAll('*')
                        .forEach((element) => {
                            const style = element.getAttribute('style') || '';
                            if (style.indexOf('-block-section') !== -1) {
                                element.classList.add('block-section');
                            }
                            if (style.indexOf('-block-component') !== -1) {
                                element.classList.add('block-component');
                            }
                        });

                    const foundGroups = [];
                    document.querySelectorAll('*[data-group]').forEach((el) => {
                        const groupName = el.getAttribute('data-group');
                        if (foundGroups.indexOf(groupName) !== -1) {
                            el.parentNode.removeChild(el);
                        } else {
                            foundGroups.push(groupName);
                        }
                    });
                });

                const sections = await page.evaluate(() => {
                    const sections  = [];
                    const variables = [];


                    $('body').find('.block-section').each((i, item) => {
                        const el = $(item);

                        const html = el.prop('outerHTML');
                        if (variables.indexOf(html) === -1) {
                            variables.push(html);

                            const components = el.find('.block-component');
                            if (components.length) {
                                const styles = [];
                                components.each((y, c) => {
                                    const cel   = $(c);
                                    const style = (cel.data('style') || cel.data('group'));
                                    if (style) {
                                        if (styles.includes(style)) {
                                            cel.hide();
                                        }
                                        styles.push(style);
                                    }
                                });
                            }

                            const rect = el[0].getBoundingClientRect();
                            sections.push({
                                width:  rect.width,
                                height: rect.height,
                                left:   rect.left,
                                top:    rect.top,
                                style:  (el.data('style') || el.data('group')),
                                block:  el.data('block'),
                                html
                            });
                        }
                    });

                    return sections;
                });

                const components = await page.evaluate(() => {
                    const components = [];
                    const variables  = [];

                    $('body').find('.block-component').each((i, item) => {
                        const el = $(item);

                        const html = el.prop('outerHTML');
                        if (variables.indexOf(html) === -1) {
                            variables.push(html);

                            const rect = el[0].getBoundingClientRect();
                            components.push({
                                width:  rect.width,
                                height: rect.height,
                                left:   rect.left,
                                top:    rect.top,
                                style:  (el.data('style') || el.data('group')),
                                block:  el.data('block'),
                                html
                            });
                        }
                    });

                    return components;
                });

                let tmpFile = '';
                let tmpDir  = '';
                if (!options.file) {
                    const tmpObj = tmp.dirSync();
                    tmpDir       = tmpObj.name;
                    tmpFile      = tmpDir + '/screenshot.jpg';
                } else {
                    tmpFile = options.file;
                }

                const opts = {
                    path:            tmpFile,
                    type:            'jpeg',
                    quality:         60,
                    fullPage:        true,
                    printBackground: true
                };
                await page.screenshot(opts);
                await browser.close();

                const screenshot = fs.readFileSync(tmpFile, { encoding: 'base64', flag: 'r' });
                if (!options.file && tmpFile && tmpDir) {
                    fs.unlinkSync(tmpFile);
                    fs.rmdirSync(tmpDir);
                }

                await res.json({
                    components,
                    sections,
                    screenshot
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
                    path:            tmpFile,
                    format:          req.body.options.format || 'Letter',
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
                const page  = await browser.newPage();
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

router.post('/heatmap', function(req, res) {
    (async () => {
        puppeteer
            .launch(launcherSettings)
            .then(async browser => {
                console.log('Generating heatmap');
                const { body }    = req;
                const { points }  = body;
                const { options } = body;

                console.log(points);

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

                await page.addScriptTag({
                    url: 'http://dev.arb.com/js/simpleheat.js'
                });
                await page.addScriptTag({
                    url: 'http://dev.arb.com/js/heatmap.js'
                });

                const tmpobj  = tmp.dirSync();
                const tmpFile = tmpobj.name + '/screenshot.png';

                const opts = {
                    path:            tmpFile,
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

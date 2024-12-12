const puppeteer = require('puppeteer');
const { PDFRStreamForBuffer, createWriterToModify, PDFStreamForResponse } = require('muhammara');
const { WritableStream } = require('memory-streams');
const fs = require('fs');

const mergePdfBlobs = (pdfBlobs) => {
    const outStream = new WritableStream();
    const [firstPdfRStream, ...restPdfRStreams] = pdfBlobs.map(pdfBlob => new PDFRStreamForBuffer(pdfBlob));
    const pdfWriter = createWriterToModify(firstPdfRStream, new PDFStreamForResponse(outStream));

    restPdfRStreams.forEach(pdfRStream => pdfWriter.appendPDFPagesFromPDF(pdfRStream));

    pdfWriter.end();
    outStream.end();

    return outStream.toBuffer();
};

let generatedPdfBlobs = [];

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    let page = await browser.newPage();
    let nextPageUrl = 'https://jaqpot.org/docs';
    const outputFileName = 'output.pdf';

    while (nextPageUrl) {
        console.log('Processing page:', nextPageUrl);

        await page.goto(nextPageUrl, { waitUntil: 'networkidle2' });

        try {
            nextPageUrl = await page.$eval('a.pagination-nav__link--next', (element) => element.href);
        } catch (e) {
            console.log(`No next page found. Saving to ${outputFileName}...`);
            nextPageUrl = null;
        }

        if(nextPageUrl != null && nextPageUrl.includes('full-api-reference')) continue;

        try {
            await page.waitForSelector('article');
            let html = await page.$eval('article', (element) => element.outerHTML);
            await page.setContent(html);
        } catch (e) {
            console.warn('Article not found on this page, skipping.');
            continue;
        }

        await page.addStyleTag({ url: 'https://jaqpot.org/docs/assets/css/styles.4bb9d1c0.css\n' });
        await page.addScriptTag({ url: 'https://jaqpot.org/docs/assets/js/main.1a9ea767.js\n' });

        const pdfBlob = await page.pdf({
            path: "",
            format: 'A4',
            printBackground: true,
            margin: { top: 20, right: 15, left: 15, bottom: 20 },
        });


        generatedPdfBlobs.push(pdfBlob);
    }

    await browser.close();

    const mergedPdfBlob = mergePdfBlobs(generatedPdfBlobs);
    fs.writeFileSync(outputFileName, mergedPdfBlob);

    console.log(`Saved merged PDF to ${outputFileName}`);
})();

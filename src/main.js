import "dotenv/config";
import path from "node:path";
import process from "node:process";
import { promises as fs } from "node:fs";

import captureWebsite from "capture-website";
import OpenAI from "openai";
import Google from "./sheet.js";

const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
const google = Google();

const SPREADSHEET_ID = "1D2TK-2Yil1WSThyYOgBm7z20cL_GXu--yGfZU4a8v_c";
const SPREADSHEET_RANGE = "Sheet1!A1:D1";

const getBtcData = async () => {
    const url = "https://data.hashrateindex.com/network-data/bitcoin-hashprice-index";
    await captureWebsite.file(url, "screenshot.png");

    const screenshotPath = path.join(process.cwd(), "screenshot.png");
    const screenshot = await fs.readFile(screenshotPath, "base64");
    const result = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "developer",
                content: "You will be sent a screenshot from a website, and your job is to find the price of BTC and the hash price. You can only answer in the format: BTC price: $1000, Hash price: $1000",
            },
            {
                role: "user",
                content: [ { type: "image_url", image_url: { url: `data:image/png:base64,${screenshot}` } } ],
            },
        ]
    });

    //Format: "BTC price: $1000, Hash price: $1000"
    const splitResult = result.choices[0].message.content.split(",");
    const btcPrice = splitResult[0].split(":")[1].trim();
    const hashPrice = splitResult[1].split(":")[1].trim();
    return [btcPrice, hashPrice];
}

const addRowToSheet = async (newRow) => {
    try {
        const result = await google.sheets.spreadsheets.values.get({
            SPREADSHEET_ID,
            SPREADSHEET_RANGE,
        });

        const existingValues = result.data.values || [];
        const updateResult = await google.sheets.spreadsheets.values.update({
            SPREADSHEET_ID,
            SPREADSHEET_RANGE: "Sheet1!A1",
            valueInputOption: "RAW",
            resource: { values: [...existingValues, newRow] },
        });

        console.log(`${updateResult.data.updatedCells} cells updated.`);

    } catch (err) {
        console.error("The GSheets API returned an error: " + err);
    }
};

const main = async () => {
    const data = await getBtcData();
    await addRowToSheet(data);
}

main();

import "dotenv/config";
import path from "node:path";
import process from "node:process";
import { promises as fs } from "node:fs";

import axios from "axios";
import * as cheerio from "cheerio";
import captureWebsite from "capture-website";
import OpenAI from "openai";

import { google } from "googleapis";
import { authenticate } from "@google-cloud/local-auth";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
const loadSavedCredentialsIfExist = async () => {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);

    } catch (err) {
        return null;
    }
};

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
const saveCredentials = async (client) => {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: "authorized_user",
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });

    await fs.writeFile(TOKEN_PATH, payload);
};

/**
 * Load or request or authorization to call APIs.
 *
 */
const authorize = async () => {
    let client = await loadSavedCredentialsIfExist();
    if (client)
        return client;

    client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });
    if (client.credentials)
        await saveCredentials(client);

    return client;
}

const getBtcData = async () => {
    const url = "https://data.hashrateindex.com/network-data/bitcoin-hashprice-index";
    await captureWebsite.file(url, "screenshot.png");

    const screenshot = await fs.readFile(path.join(process.cwd(), "screenshot.png"), "base64");
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

const addRowToSheet = async (auth, newRow) => {
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = "1D2TK-2Yil1WSThyYOgBm7z20cL_GXu--yGfZU4a8v_c";
    const range = "Sheet1!A1:D1";

    try {
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const existingValues = result.data.values || [];

        // Update the sheet with the new data
        const updateResult = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Sheet1!A1", // Update starting from the first cell
        valueInputOption: "RAW",
        resource: { values: [...existingValues, newRow] },
        });

        console.log(`${updateResult.data.updatedCells} cells updated.`);

    } catch (err) {
        console.error("The API returned an error: " + err);
    }
};

const main = async () => {
    const auth = await authorize();
    const newRow = await getBtcData();
    addRowToSheet(auth, newRow);
}

main();

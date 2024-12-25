import { ethers } from "ethers";
import fs, { write } from "fs";
import { logger } from "./logger";

// This is to analyse the frequency of ping count. Not related to app

const provider = new ethers.JsonRpcProvider(
	"https://eth-sepolia.g.alchemy.com/v2/d9H3KCbS_zjgPvBUWlCrMKmoN5g2Vm8c"
);
const contractAddress = "0xA7F42ff7433cB268dD7D59be62b00c30dEd28d3D";
const eventSignature = ethers.id("Ping()");

const logFilePath = "PingEvents.log";

function writeLog(message: string) {
	fs.appendFileSync(logFilePath, `${new Date().toISOString()}: ${message}\n`);
}

async function getPingEvents(
	startBlock: number,
	endBlock: number
): Promise<number> {
	const logs = await provider.getLogs({
		address: contractAddress,
		fromBlock: startBlock,
		toBlock: endBlock,
		topics: [eventSignature],
	});
	return logs.length;
}

async function getPingEventsPerPeriod(
	latestBlock: number,
	period: number,
	blocksPerPeriod: number
): Promise<number[]> {
	const eventsPerPeriod: number[] = [];
	for (let i = 0; i < period; i++) {
		const startBlock = latestBlock - blocksPerPeriod * (i + 1);
		const endBlock = latestBlock - blocksPerPeriod * i;
		const events = await getPingEvents(startBlock, endBlock);
		eventsPerPeriod.push(events);
	}
	return eventsPerPeriod;
}

async function main() {
	try {
		const latestBlock = await provider.getBlockNumber();
		const blocksPerHour = Math.floor(3600 / 12);
		const blocksPerDay = blocksPerHour * 24;
		const blocksPerWeek = blocksPerDay * 7;

		writeLog("Fetching hourly Ping events for the last 24 hours...");
		const pingEventsPerHour = await getPingEventsPerPeriod(
			latestBlock,
			24,
			blocksPerHour
		);
		pingEventsPerHour.forEach((events, i) =>
			writeLog(`Hour ${23 - i}: ${events} events`)
		);

		writeLog("Fetching daily Ping events for the last 7 days...");
		const pingEventsPerDay = await getPingEventsPerPeriod(
			latestBlock,
			7,
			blocksPerDay
		);
		pingEventsPerDay.forEach((events, i) =>
			writeLog(`Day ${6 - i}: ${events} events`)
		);

		writeLog("Fetching weekly Ping events for the last 4 weeks...");
		const pingEventsPerWeek = await getPingEventsPerPeriod(
			latestBlock,
			4,
			blocksPerWeek
		);
		pingEventsPerWeek.forEach((events, i) =>
			writeLog(`Week ${3 - i}: ${events} events`)
		);

		writeLog("\nSummary:");
		writeLog(
			`Hourly Ping Events (Last 24 hours): ${pingEventsPerHour.reduce(
				(a, b) => a + b,
				0
			)}`
		);
		writeLog(
			`Daily Ping Events (Last 7 days): ${pingEventsPerDay.reduce(
				(a, b) => a + b,
				0
			)}`
		);
		writeLog(
			`Weekly Ping Events (Last 4 weeks): ${pingEventsPerWeek.reduce(
				(a, b) => a + b,
				0
			)}`
		);
	} catch (error) {
		logger.error(error);
	}
}

(async () => {
	try {
		await main();
	} catch (error) {
		logger.error("An error occurred:", error);
	}
})();

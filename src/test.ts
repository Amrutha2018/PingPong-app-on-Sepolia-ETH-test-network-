import Bottleneck from "bottleneck";
import { logger } from "./logger";
import { AppContext } from "./appContext";

export async function testWebsocketFallback() {
	const { wsProvider } = AppContext;
	wsProvider.emit("error", new Error("Test error"));
}

async function fetchMissedEvents(block: number): Promise<void> {
	logger.info(`fetchMissedEvents called at ${new Date().toISOString()}`);
	await new Promise((resolve) => setTimeout(resolve, 100));
}

export async function testThrottling() {
	const calls = [];
	for (let i = 0; i < 50; i++) {
		calls.push(testLimiter.schedule(() => fetchMissedEvents(i)));
	}
	await Promise.all(calls);
	logger.info("All calls completed.");
}

const testLimiter = new Bottleneck({
	reservoir: 5,
	reservoirRefreshAmount: 5,
	reservoirRefreshInterval: 10_000,
	minTime: 100,
});

testLimiter.on("depleted", () => {
	logger.info("Request limit reached. Throttling requests...");
});

export async function testReservoirDepletion() {
	for (let i = 0; i < 10; i++) {
		testLimiter
			.schedule(() => fetchMissedEvents(i))
			.then(() => console.log(`Request ${i} succeeded`))
			.catch((err) => console.error(`Request ${i} failed`, err));
	}
}

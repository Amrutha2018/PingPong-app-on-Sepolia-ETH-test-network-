import fs from "fs";
import path from "path";
import { TransactionResponse } from "ethers";
import { AppContext } from "../appContext";
import { logger } from "../logger";

export interface IPendingEntry {
	blockNumber: number;
	logIndex: number;
	pingTxHash: string;
	pongTxHash?: string;
	createdAt: number;
	attempts: number;
	nonce: number;
	canceled: boolean;
	cancelledHash: string;
}

const PENDING_FILE = path.join(__dirname, "pendingStore.json");

const CANCELLED_FILE = path.join(__dirname, "cancelledTransactions.json");

export function loadPendingEntries(): IPendingEntry[] {
	if (!fs.existsSync(PENDING_FILE)) {
		return [];
	}
	const raw = fs.readFileSync(PENDING_FILE, "utf8");
	try {
		const data: IPendingEntry[] = JSON.parse(raw);
		return data;
	} catch {
		return [];
	}
}

export function savePendingEntries(entries: IPendingEntry[]): void {
	fs.writeFileSync(PENDING_FILE, JSON.stringify(entries, null, 2));
}

export function addPendingEntry(entry: IPendingEntry): void {
	const existing = AppContext.pendingPongs;
	existing.push(entry);
	AppContext.pendingPongs = existing;
	savePendingEntries(existing);
}

export function updatePendingEntry(
	blockNumber: number,
	logIndex: number,
	updates: Partial<IPendingEntry>
): void {
	let entries = AppContext.pendingPongs;
	entries = entries.map((entry) => {
		if (entry.blockNumber === blockNumber && entry.logIndex === logIndex) {
			return { ...entry, ...updates };
		}
		return entry;
	});
	AppContext.pendingPongs = entries;
	savePendingEntries(entries);
}

export function removePendingEntry(
	blockNumber: number,
	logIndex: number
): void {
	let entries = AppContext.pendingPongs;
	entries = entries.filter(
		(e) => !(e.blockNumber === blockNumber && e.logIndex === logIndex)
	);
	AppContext.pendingPongs = entries;
	savePendingEntries(entries);
}

export function moveEntryToCancelled(entry: IPendingEntry) {
	let cancelledEntries: IPendingEntry[] = [];
	if (fs.existsSync(CANCELLED_FILE)) {
		const raw = fs.readFileSync(CANCELLED_FILE, "utf-8");
		cancelledEntries = JSON.parse(raw) as IPendingEntry[];
	}

	cancelledEntries.push(entry);
	fs.writeFileSync(CANCELLED_FILE, JSON.stringify(cancelledEntries, null, 2));

	logger.info(
		`Moved (nonce=${entry.nonce}, oldTxHash=${entry.pongTxHash}) to cancelledTransactions.json`
	);
}

import { ethers } from "ethers";
import dotenv from "dotenv";
import { loadConfirmedState } from "./state_managers/confirmedStateManager";
import {
	IPendingEntry,
	loadPendingEntries,
} from "./state_managers/pendingStateManager";
import { logger } from "./logger";

dotenv.config();

const HTTP_PROVIDER_URL = process.env.HTTP_PROVIDER_URL;
const WEBSOCKET_PROVIDER_URL = process.env.WEBSOCKET_PROVIDER_URL;

const CONTRACT_ADDRESS = "0xA7F42ff7433cB268dD7D59be62b00c30dEd28d3D";
const CONTRACT_ABI = [
	{ inputs: [], stateMutability: "nonpayable", type: "constructor" },
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "pinger",
				type: "address",
			},
		],
		name: "NewPinger",
		type: "event",
	},
	{ anonymous: false, inputs: [], name: "Ping", type: "event" },
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "bytes32",
				name: "txHash",
				type: "bytes32",
			},
		],
		name: "Pong",
		type: "event",
	},
	{
		inputs: [{ internalType: "address", name: "_pinger", type: "address" }],
		name: "changePinger",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [],
		name: "ping",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [],
		name: "pinger",
		outputs: [{ internalType: "address", name: "", type: "address" }],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [{ internalType: "bytes32", name: "_txHash", type: "bytes32" }],
		name: "pong",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
];

export interface IAppContext {
	httpProvider: ethers.JsonRpcProvider;
	wsProvider: ethers.WebSocketProvider;
	wallet: ethers.Wallet;
	pingPongContract: ethers.Contract;
	topics: {
		ping: string;
		pong: string;
	};
	confirmedState: {
		lastProcessedBlock: number;
		lastProcessedLogIndex: number;
	};
	pendingState: {
		lastProcessedBlock: number;
		lastProcessedLogIndex: number;
	};
	pendingPongs: IPendingEntry[];
	contractAddress: string;
}

export const AppContext: IAppContext = {
	httpProvider: {} as ethers.JsonRpcProvider,
	wsProvider: {} as ethers.WebSocketProvider,
	wallet: {} as ethers.Wallet,
	pingPongContract: {} as ethers.Contract,
	topics: {
		ping: "",
		pong: "",
	},
	confirmedState: {
		lastProcessedBlock: 0,
		lastProcessedLogIndex: 0,
	},
	pendingState: {
		lastProcessedBlock: 0,
		lastProcessedLogIndex: 0,
	},
	pendingPongs: [],
	contractAddress: "",
};

export async function initializeAppContext() {
	const privateKey = process.env.PRIVATE_KEY;
	if (!privateKey) {
		throw new Error("PRIVATE_KEY is not set in the environment (.env).");
	}
	if (!HTTP_PROVIDER_URL || !WEBSOCKET_PROVIDER_URL) {
		throw new Error("Provider URLs Missing!");
	}

	AppContext.httpProvider = new ethers.JsonRpcProvider(HTTP_PROVIDER_URL);
	AppContext.wsProvider = new ethers.WebSocketProvider(WEBSOCKET_PROVIDER_URL);
	AppContext.wallet = new ethers.Wallet(privateKey, AppContext.wsProvider);
	AppContext.pingPongContract = new ethers.Contract(
		CONTRACT_ADDRESS,
		CONTRACT_ABI,
		AppContext.wallet
	);
	AppContext.topics.ping = ethers.id("Ping()");
	AppContext.topics.pong = ethers.id("Pong(bytes32)");
	AppContext.confirmedState = loadConfirmedState();
	const pendingPongs = loadPendingEntries();
	if (pendingPongs.length > 0) {
		pendingPongs.sort((a, b) => {
			if (a.blockNumber === b.blockNumber) {
				return a.logIndex - b.logIndex;
			}
			return a.blockNumber - b.blockNumber;
		});
		AppContext.pendingPongs = pendingPongs;
		AppContext.pendingState = {
			lastProcessedBlock: pendingPongs[pendingPongs.length - 1].blockNumber,
			lastProcessedLogIndex: pendingPongs[pendingPongs.length - 1].logIndex,
		};
	}
	AppContext.contractAddress = CONTRACT_ADDRESS;

	try {
		const currentPinger = await AppContext.pingPongContract.pinger();
	} catch (error) {
		logger.error("Failed to connect to contract");
		throw error;
	}
	logger.info("AppContext initialized successfully!");
}

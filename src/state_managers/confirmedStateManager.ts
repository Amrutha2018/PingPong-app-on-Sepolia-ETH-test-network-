import fs from "fs";
import dotenv from "dotenv";
import { logger } from "../logger";

dotenv.config();

const STATE_FILE = "state.json";

export interface IState {
  lastProcessedBlock: number;
  lastProcessedLogIndex: number;
}

export function loadConfirmedState(): IState {
  if (!fs.existsSync(STATE_FILE)) {
    const startingBlockFromEnv = process.env.STARTING_BLOCK
      ? parseInt(process.env.STARTING_BLOCK, 10) - 1
      : undefined;
    const initialState: IState = {
      lastProcessedBlock: startingBlockFromEnv || 0,
      lastProcessedLogIndex: 0,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(initialState, null, 2));
    logger.info(
      `State file not found. Initialized with startingBlock: ${initialState.lastProcessedBlock}`
    );
    return initialState;
  }
  const raw = fs.readFileSync(STATE_FILE, "utf8");
  const data: IState = JSON.parse(raw);
  logger.info(
    `Loaded state from state.json: lastProcessedBlock = ${data.lastProcessedBlock}`
  );
  return data;
}

export function saveConfirmedState(state: IState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  logger.info(`State saved: lastProcessedBlock = ${state.lastProcessedBlock}`);
}

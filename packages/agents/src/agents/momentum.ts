/**
 * Momentum Agent — follows price trend using EMA(20).
 *
 * Strategy:
 *   - Buy when spot price crosses ABOVE the 20-period EMA (trend turning up)
 *   - Sell entire mETH position when spot crosses BELOW the EMA (trend turning down)
 *   - Polls every POLL_INTERVAL_MS and submits an action when signal fires
 *
 * Uses Thirdweb SDK for all Mantle interactions (Mantle ecosystem tooling).
 */
import { getPrice, PriceHistory } from "../utils/oracle.js";
import { submitTrade, usdAmount, fractionOfHoldings } from "../utils/submit.js";
import { getPortfolio } from "../utils/signer.js";
import { Buy, Sell } from "../utils/signer.js";
import { ASSETS, agentConfig } from "../config.js";

const POLL_INTERVAL_MS = 15_000; // 15 seconds between decisions
const EMA_PERIODS = 20;
const BUY_NOTIONAL = usdAmount(500); // spend $500 quote per buy signal
const MIN_SAMPLES_BEFORE_TRADE = 5;  // warm up EMA before acting

const TARGET_ASSET = ASSETS.mETH;

async function run(): Promise<void> {
  console.log(`[Momentum] Starting — agentId=${agentConfig.agentId} challengeId=${agentConfig.challengeId}`);

  const history = new PriceHistory(EMA_PERIODS * 2);
  let inPosition = false;

  while (true) {
    try {
      const price = await getPrice(TARGET_ASSET);
      history.push(price);

      if (history.length < MIN_SAMPLES_BEFORE_TRADE) {
        console.log(`[Momentum] Warming up (${history.length}/${MIN_SAMPLES_BEFORE_TRADE}) price=${price}`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const ema = history.ema(EMA_PERIODS);
      const priceLead = (price * 10000n) / ema; // basis points above EMA

      console.log(`[Momentum] price=${price} ema=${ema} ratio=${priceLead}bps inPosition=${inPosition}`);

      if (!inPosition && priceLead > 10100n) {
        // Price > 101% of EMA → bullish momentum, enter
        const { cash } = await getPortfolio();
        const size = cash < BUY_NOTIONAL ? cash : BUY_NOTIONAL;
        if (size > 0n) {
          await submitTrade({ kind: Buy, asset: TARGET_ASSET, size });
          inPosition = true;
        }
      } else if (inPosition && priceLead < 9900n) {
        // Price < 99% of EMA → momentum flipped, exit
        const { cash } = await getPortfolio();
        // Approximate holdings = portfolio value - cash (rough; could read holdings directly)
        const { value } = await getPortfolio();
        const holdingsApprox = fractionOfHoldings(value - cash, 1.0);
        if (holdingsApprox > 0n) {
          await submitTrade({ kind: Sell, asset: TARGET_ASSET, size: holdingsApprox });
          inPosition = false;
        }
      }
    } catch (err) {
      console.error("[Momentum] Error:", err);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

run().catch(console.error);

/**
 * Mean-Reversion Agent — fades moves away from EMA(20).
 *
 * Strategy:
 *   - Buy the dip: price drops >2% below EMA → expect reversion up
 *   - Sell the rip: price rises >2% above EMA → expect reversion down
 *   - Smaller position sizes because we're betting against momentum
 *
 * Uses Thirdweb SDK for all Mantle interactions.
 */
import "dotenv/config";
import { getPrice, PriceHistory } from "../utils/oracle.js";
import { submitTrade, usdAmount, fractionOfHoldings } from "../utils/submit.js";
import { getPortfolio } from "../utils/signer.js";
import { Buy, Sell } from "../utils/signer.js";
import { ASSETS, agentConfig } from "../config.js";

const POLL_INTERVAL_MS = 15_000;
const EMA_PERIODS = 20;
const BUY_NOTIONAL = usdAmount(300); // smaller size — higher risk strategy
const REVERSION_THRESHOLD_BPS = 200n; // 2% deviation triggers trade
const MIN_SAMPLES_BEFORE_TRADE = 5;

const TARGET_ASSET = ASSETS.mETH;

async function run(): Promise<void> {
  console.log(`[MeanReversion] Starting — agentId=${agentConfig.agentId} challengeId=${agentConfig.challengeId}`);

  const history = new PriceHistory(EMA_PERIODS * 2);
  let inPosition = false;

  while (true) {
    try {
      const price = await getPrice(TARGET_ASSET);
      history.push(price);

      if (history.length < MIN_SAMPLES_BEFORE_TRADE) {
        console.log(`[MeanReversion] Warming up (${history.length}/${MIN_SAMPLES_BEFORE_TRADE})`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const ema = history.ema(EMA_PERIODS);
      // deviation in basis points: (price - ema) * 10000 / ema
      const deviation = ((price - ema) * 10000n) / ema;

      console.log(`[MeanReversion] price=${price} ema=${ema} deviation=${deviation}bps inPosition=${inPosition}`);

      if (!inPosition && deviation < -REVERSION_THRESHOLD_BPS) {
        // Price dropped >2% below EMA → buy the dip
        const { cash } = await getPortfolio();
        const size = cash < BUY_NOTIONAL ? cash : BUY_NOTIONAL;
        if (size > 0n) {
          await submitTrade({ kind: Buy, asset: TARGET_ASSET, size });
          inPosition = true;
        }
      } else if (inPosition && deviation > REVERSION_THRESHOLD_BPS) {
        // Price pumped >2% above EMA → take profit
        const { value, cash } = await getPortfolio();
        const holdingsValue = value > cash ? value - cash : 0n;
        const sellSize = fractionOfHoldings(holdingsValue, 1.0);
        if (sellSize > 0n) {
          await submitTrade({ kind: Sell, asset: TARGET_ASSET, size: sellSize });
          inPosition = false;
        }
      }
    } catch (err) {
      console.error("[MeanReversion] Error:", err);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

run().catch(console.error);

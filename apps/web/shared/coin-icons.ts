import type { Asset } from '../../../functions/src/market';
import ada from '../assets/coins/ada.svg?no-inline';
import algo from '../assets/coins/algo.svg?no-inline';
import atom from '../assets/coins/atom.svg?no-inline';
import avax from '../assets/coins/avax.svg?no-inline';
import btc from '../assets/coins/btc.svg?no-inline';
import btg from '../assets/coins/btg.svg?no-inline';
import bts from '../assets/coins/bts.svg?no-inline';
import doge from '../assets/coins/doge.svg?no-inline';
import dot from '../assets/coins/dot.svg?no-inline';
import etc from '../assets/coins/etc.svg?no-inline';
import eth from '../assets/coins/eth.svg?no-inline';
import fil from '../assets/coins/fil.svg?no-inline';
import link from '../assets/coins/link.svg?no-inline';
import ltc from '../assets/coins/ltc.svg?no-inline';
import matic from '../assets/coins/matic.svg?no-inline';
import sol from '../assets/coins/sol.svg?no-inline';
import trx from '../assets/coins/trx.svg?no-inline';
import uni from '../assets/coins/uni.svg?no-inline';
import usdt from '../assets/coins/usdt.svg?no-inline';
import vet from '../assets/coins/vet.svg?no-inline';
import xlm from '../assets/coins/xlm.svg?no-inline';
import xrp from '../assets/coins/xrp.svg?no-inline';

type CoinCode = Asset['code'] | 'USDT';

export const coinLogoUrls = {
  ADA: ada,
  ALGO: algo,
  ATOM: atom,
  AVAX: avax,
  BTC: btc,
  BTG: btg,
  BTS: bts,
  DOGE: doge,
  DOT: dot,
  ETC: etc,
  ETH: eth,
  FIL: fil,
  LINK: link,
  LTC: ltc,
  MATIC: matic,
  SOL: sol,
  TRX: trx,
  UNI: uni,
  USDT: usdt,
  VET: vet,
  XLM: xlm,
  XRP: xrp,
} satisfies Record<CoinCode, string>;

export function coinIcon(code: CoinCode, size = 20) {
  return `<img class="coin-logo" src="${coinLogoUrls[code]}" width="${size}" height="${size}" alt="">`;
}

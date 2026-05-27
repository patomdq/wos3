# =============================================================================
# INTRADAY TRADING SYSTEM — ORB + VWAP Multi-Signal
# =============================================================================
# Requirements (requirements.txt content):
#   pandas>=2.0.0
#   numpy>=1.24.0
#   yfinance>=0.2.36
#   matplotlib>=3.7.0
#   pytz>=2023.3
# =============================================================================

from __future__ import annotations

import warnings
warnings.filterwarnings("ignore")

import sys
import math
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, date
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.colors import TwoSlopeNorm
import pytz

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class SystemConfig:
    # Account
    initial_capital: float = 20_000.0          # EUR
    max_risk_per_trade: float = 0.01            # 1% per trade
    daily_loss_limit_pct: float = 0.02          # −2% stops day
    max_trades_per_session: int = 3

    # ORB
    orb_minutes: int = 15                       # opening range window

    # Filters
    vwap_filter: bool = True
    volume_surge_multiplier: float = 1.5        # >150% of 20-bar avg
    volume_lookback: int = 20
    atr_period: int = 14
    min_rr_ratio: float = 1.5                   # min reward:risk

    # Sizing (ATR stop multiplier)
    stop_atr_multiplier: float = 1.0
    target_atr_multiplier: float = 1.5          # target = 1.5× stop

    # Session windows — times in LOCAL market timezone
    # European (CET/Berlin): 08:00-11:30
    # US (America/New_York): 09:30-12:00  (= 15:30-18:00 CET)
    european_session_start: time = time(8, 0)
    european_session_end: time = time(11, 30)
    us_session_start: time = time(9, 30)   # in America/New_York
    us_session_end: time = time(12, 0)     # in America/New_York

    # Point values (micro futures reference — used for sizing commentary)
    point_values: dict = field(default_factory=lambda: {
        "MES": 5.0,    # S&P 500 micro, $5 per point
        "MNQ": 2.0,    # Nasdaq micro, $2 per point
        "FDXM": 1.0,   # DAX micro, €1 per point
        "SPY": 1.0,    # ETF proxy
        "QQQ": 1.0,
        "EWG": 1.0,
    })


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Trade:
    entry_date: date
    ticker: str
    direction: int                 # +1 long, -1 short
    entry_price: float
    stop_price: float
    target_price: float
    exit_price: float = 0.0
    exit_reason: str = ""         # "target", "stop", "eod"
    contracts: float = 0.0
    pnl: float = 0.0
    r_multiple: float = 0.0
    entry_time: Optional[datetime] = None
    exit_time: Optional[datetime] = None


@dataclass
class DailyStats:
    date: date
    starting_capital: float
    realized_pnl: float = 0.0
    trades: int = 0
    stopped: bool = False          # daily loss limit hit


# ---------------------------------------------------------------------------
# DataFetcher
# ---------------------------------------------------------------------------

class DataFetcher:
    """Downloads and caches OHLCV data via yfinance.

    For live trading, replace `fetch_intraday` with a broker API adapter
    (Interactive Brokers TWS, Tastytrade, etc.) that returns the same
    DataFrame schema.
    """

    CACHE: dict[str, pd.DataFrame] = {}

    @staticmethod
    def fetch_intraday(
        ticker: str,
        period: str = "2y",
        interval: str = "15m",
        tz: str = "CET",
    ) -> pd.DataFrame:
        """Return OHLCV with DatetimeIndex in the requested timezone."""
        cache_key = f"{ticker}_{period}_{interval}"
        if cache_key in DataFetcher.CACHE:
            return DataFetcher.CACHE[cache_key].copy()

        print(f"  Downloading {ticker} [{interval}, {period}] …", end=" ", flush=True)
        raw = yf.download(
            ticker,
            period=period,
            interval=interval,
            auto_adjust=True,
            progress=False,
        )
        if raw.empty:
            raise ValueError(f"No data returned for {ticker}")

        # Flatten MultiIndex columns if present
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)

        raw.index = pd.to_datetime(raw.index)
        if raw.index.tz is None:
            raw.index = raw.index.tz_localize("UTC")
        raw.index = raw.index.tz_convert(tz)

        raw = raw[["Open", "High", "Low", "Close", "Volume"]].copy()
        raw.dropna(inplace=True)
        print("done.")
        DataFetcher.CACHE[cache_key] = raw
        return raw.copy()

    @staticmethod
    def fetch_daily(ticker: str, period: str = "2y") -> pd.DataFrame:
        """Daily OHLCV for ATR baseline calculations."""
        cache_key = f"{ticker}_daily_{period}"
        if cache_key in DataFetcher.CACHE:
            return DataFetcher.CACHE[cache_key].copy()

        raw = yf.download(ticker, period=period, interval="1d",
                          auto_adjust=True, progress=False)
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        raw.index = pd.to_datetime(raw.index)
        raw = raw[["Open", "High", "Low", "Close", "Volume"]].copy()
        raw.dropna(inplace=True)
        DataFetcher.CACHE[cache_key] = raw
        return raw.copy()


# ---------------------------------------------------------------------------
# Indicators (vectorized, no external libraries)
# ---------------------------------------------------------------------------

class Indicators:
    @staticmethod
    def true_range(df: pd.DataFrame) -> pd.Series:
        """True Range = max(H-L, |H-Cprev|, |L-Cprev|)."""
        hl = df["High"] - df["Low"]
        hc = (df["High"] - df["Close"].shift(1)).abs()
        lc = (df["Low"] - df["Close"].shift(1)).abs()
        return pd.concat([hl, hc, lc], axis=1).max(axis=1)

    @staticmethod
    def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
        tr = Indicators.true_range(df)
        return tr.ewm(alpha=1 / period, adjust=False).mean()

    @staticmethod
    def vwap_daily(df: pd.DataFrame) -> pd.Series:
        """VWAP reset each trading day."""
        typical = (df["High"] + df["Low"] + df["Close"]) / 3
        tp_vol = typical * df["Volume"]

        dates = df.index.normalize()
        cumtp = tp_vol.groupby(dates).cumsum()
        cumvol = df["Volume"].groupby(dates).cumsum()
        return cumtp / cumvol.replace(0, np.nan)

    @staticmethod
    def rolling_volume_avg(df: pd.DataFrame, period: int = 20) -> pd.Series:
        return df["Volume"].rolling(window=period, min_periods=1).mean()


# ---------------------------------------------------------------------------
# ORBStrategy
# ---------------------------------------------------------------------------

class ORBStrategy:
    """Opening Range Breakout signal generator.

    For each trading day:
    1. Compute the Opening Range (first `orb_minutes` of session).
    2. On subsequent bars within the session, check for breakout with
       volume surge and VWAP alignment.
    3. Return a DataFrame of signals with entry/stop/target.
    """

    def __init__(self, config: SystemConfig):
        self.cfg = config

    def _session_window(
        self, ticker: str
    ) -> tuple[time, time]:
        """Return (start, end) session times in LOCAL market timezone.

        The DataFrame must already be localised to the correct market timezone
        (America/New_York for US instruments, Europe/Berlin for EU instruments).
        We compare .time() directly, so no CET conversion is needed.
        """
        if ticker.upper() in {"EWG", "FDXM", "^GDAXI"}:
            return self.cfg.european_session_start, self.cfg.european_session_end
        # US: 09:30-12:00 Eastern
        return self.cfg.us_session_start, self.cfg.us_session_end

    def generate_signals(
        self,
        df: pd.DataFrame,
        ticker: str,
    ) -> list[Trade]:
        """Process entire OHLCV DataFrame and return list of Trade objects."""
        cfg = self.cfg
        sess_start, sess_end = self._session_window(ticker)

        # Pre-compute indicators on the full dataframe
        df = df.copy()
        df["ATR"] = Indicators.atr(df, cfg.atr_period)
        df["VWAP"] = Indicators.vwap_daily(df)
        df["VolAvg"] = Indicators.rolling_volume_avg(df, cfg.volume_lookback)

        trades: list[Trade] = []

        # Group by calendar date
        df["_date"] = df.index.normalize()
        for day, day_df in df.groupby("_date"):
            day_df = day_df.copy()
            day_trades = self._process_day(
                day_df, ticker, sess_start, sess_end
            )
            trades.extend(day_trades)

        return trades

    def _process_day(
        self,
        day_df: pd.DataFrame,
        ticker: str,
        sess_start: time,
        sess_end: time,
    ) -> list[Trade]:
        cfg = self.cfg
        trades: list[Trade] = []

        # Filter to session bars
        bar_times = day_df.index.time
        session_mask = (bar_times >= sess_start) & (bar_times < sess_end)
        session_df = day_df[session_mask]

        if len(session_df) < 2:
            return trades

        # --- Opening Range (first bar(s) covering orb_minutes) ---
        # With 15-min bars, first bar IS the opening range
        orb_bar = session_df.iloc[0]
        orb_high = orb_bar["High"]
        orb_low  = orb_bar["Low"]

        trade_count = 0
        in_trade = False
        active_trade: Optional[Trade] = None
        daily_pnl = 0.0

        # Iterate bars after opening range
        for idx in range(1, len(session_df)):
            if trade_count >= cfg.max_trades_per_session:
                break
            if daily_pnl < -(cfg.initial_capital * cfg.daily_loss_limit_pct):
                break

            bar = session_df.iloc[idx]
            bar_time = session_df.index[idx]

            atr_val  = bar["ATR"]
            vwap_val = bar["VWAP"]
            vol_avg  = bar["VolAvg"]

            if in_trade and active_trade is not None:
                # Check exit conditions
                direction = active_trade.direction
                if direction == 1:  # long
                    if bar["Low"] <= active_trade.stop_price:
                        pnl = (active_trade.stop_price - active_trade.entry_price) * active_trade.contracts
                        active_trade.exit_price = active_trade.stop_price
                        active_trade.exit_reason = "stop"
                        active_trade.exit_time = bar_time
                        active_trade.pnl = pnl
                        r_dist = abs(active_trade.entry_price - active_trade.stop_price)
                        active_trade.r_multiple = pnl / (r_dist * active_trade.contracts + 1e-9)
                        trades.append(active_trade)
                        daily_pnl += pnl
                        in_trade = False
                        active_trade = None
                        continue
                    elif bar["High"] >= active_trade.target_price:
                        pnl = (active_trade.target_price - active_trade.entry_price) * active_trade.contracts
                        active_trade.exit_price = active_trade.target_price
                        active_trade.exit_reason = "target"
                        active_trade.exit_time = bar_time
                        active_trade.pnl = pnl
                        r_dist = abs(active_trade.entry_price - active_trade.stop_price)
                        active_trade.r_multiple = pnl / (r_dist * active_trade.contracts + 1e-9)
                        trades.append(active_trade)
                        daily_pnl += pnl
                        in_trade = False
                        active_trade = None
                        continue
                else:  # short
                    if bar["High"] >= active_trade.stop_price:
                        pnl = (active_trade.entry_price - active_trade.stop_price) * active_trade.contracts
                        active_trade.exit_price = active_trade.stop_price
                        active_trade.exit_reason = "stop"
                        active_trade.exit_time = bar_time
                        active_trade.pnl = pnl
                        r_dist = abs(active_trade.entry_price - active_trade.stop_price)
                        active_trade.r_multiple = pnl / (r_dist * active_trade.contracts + 1e-9)
                        trades.append(active_trade)
                        daily_pnl += pnl
                        in_trade = False
                        active_trade = None
                        continue
                    elif bar["Low"] <= active_trade.target_price:
                        pnl = (active_trade.entry_price - active_trade.target_price) * active_trade.contracts
                        active_trade.exit_price = active_trade.target_price
                        active_trade.exit_reason = "target"
                        active_trade.exit_time = bar_time
                        active_trade.pnl = pnl
                        r_dist = abs(active_trade.entry_price - active_trade.stop_price)
                        active_trade.r_multiple = pnl / (r_dist * active_trade.contracts + 1e-9)
                        trades.append(active_trade)
                        daily_pnl += pnl
                        in_trade = False
                        active_trade = None
                        continue

            if in_trade:
                continue  # no new signals while in trade (no pyramiding)

            if pd.isna(atr_val) or pd.isna(vwap_val) or atr_val == 0:
                continue

            # Volume surge check
            volume_ok = (vol_avg > 0) and (bar["Volume"] >= cfg.volume_surge_multiplier * vol_avg)

            # --- LONG signal ---
            if bar["Close"] > orb_high and volume_ok:
                entry  = bar["Close"]
                stop   = entry - cfg.stop_atr_multiplier * atr_val
                target = entry + cfg.target_atr_multiplier * atr_val
                risk   = entry - stop

                # VWAP filter
                vwap_ok = (not cfg.vwap_filter) or (entry > vwap_val)

                # R:R filter
                rr_ok = (target - entry) >= cfg.min_rr_ratio * risk if risk > 0 else False

                if vwap_ok and rr_ok:
                    contracts = self._position_size(cfg, risk)
                    active_trade = Trade(
                        entry_date=bar_time.date(),
                        ticker=ticker,
                        direction=1,
                        entry_price=entry,
                        stop_price=stop,
                        target_price=target,
                        contracts=contracts,
                        entry_time=bar_time,
                    )
                    in_trade = True
                    trade_count += 1

            # --- SHORT signal ---
            elif bar["Close"] < orb_low and volume_ok:
                entry  = bar["Close"]
                stop   = entry + cfg.stop_atr_multiplier * atr_val
                target = entry - cfg.target_atr_multiplier * atr_val
                risk   = stop - entry

                vwap_ok = (not cfg.vwap_filter) or (entry < vwap_val)
                rr_ok = (entry - target) >= cfg.min_rr_ratio * risk if risk > 0 else False

                if vwap_ok and rr_ok:
                    contracts = self._position_size(cfg, risk)
                    active_trade = Trade(
                        entry_date=bar_time.date(),
                        ticker=ticker,
                        direction=-1,
                        entry_price=entry,
                        stop_price=stop,
                        target_price=target,
                        contracts=contracts,
                        entry_time=bar_time,
                    )
                    in_trade = True
                    trade_count += 1

        # End-of-day close for any open trade
        if in_trade and active_trade is not None:
            last_bar = session_df.iloc[-1]
            eod_price = last_bar["Close"]
            direction = active_trade.direction
            pnl = (eod_price - active_trade.entry_price) * direction * active_trade.contracts
            active_trade.exit_price = eod_price
            active_trade.exit_reason = "eod"
            active_trade.exit_time = session_df.index[-1]
            active_trade.pnl = pnl
            r_dist = abs(active_trade.entry_price - active_trade.stop_price)
            active_trade.r_multiple = (pnl / (r_dist * active_trade.contracts)) if r_dist > 0 else 0.0
            trades.append(active_trade)

        return trades

    @staticmethod
    def _position_size(cfg: SystemConfig, stop_distance: float) -> float:
        """Contracts (or share units) based on 1% risk rule."""
        if stop_distance <= 0:
            return 0.0
        max_loss = cfg.initial_capital * cfg.max_risk_per_trade
        contracts = max_loss / stop_distance
        return max(contracts, 0.0)


# ---------------------------------------------------------------------------
# RiskManager
# ---------------------------------------------------------------------------

class RiskManager:
    """Applies portfolio-level risk constraints to a trade list."""

    def __init__(self, config: SystemConfig):
        self.cfg = config

    def apply_daily_loss_limit(self, trades: list[Trade]) -> list[Trade]:
        """Remove trades that would have been blocked by the daily −2% limit."""
        filtered: list[Trade] = []
        daily_pnl: dict[date, float] = {}
        capital = self.cfg.initial_capital

        for t in sorted(trades, key=lambda x: (x.entry_date, x.entry_time or datetime.min)):
            d = t.entry_date
            running = daily_pnl.get(d, 0.0)
            limit = -capital * self.cfg.daily_loss_limit_pct

            if running < limit:
                continue  # session already stopped

            filtered.append(t)
            daily_pnl[d] = running + t.pnl
            # Update rolling capital
            capital += t.pnl

        return filtered

    def trade_summary(self, trades: list[Trade]) -> pd.DataFrame:
        if not trades:
            return pd.DataFrame()
        rows = []
        for t in trades:
            rows.append({
                "date": t.entry_date,
                "ticker": t.ticker,
                "direction": "LONG" if t.direction == 1 else "SHORT",
                "entry": round(t.entry_price, 4),
                "stop": round(t.stop_price, 4),
                "target": round(t.target_price, 4),
                "exit": round(t.exit_price, 4),
                "exit_reason": t.exit_reason,
                "contracts": round(t.contracts, 4),
                "pnl": round(t.pnl, 2),
                "r_multiple": round(t.r_multiple, 2),
            })
        return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Backtester
# ---------------------------------------------------------------------------

class Backtester:
    """Vectorized backtest engine.

    Takes a list of Trade objects and reconstructs daily equity curve,
    then computes all performance metrics.
    """

    def __init__(self, config: SystemConfig):
        self.cfg = config
        self.trades: list[Trade] = []
        self.equity_curve: pd.Series = pd.Series(dtype=float)

    def run(self, trades: list[Trade]) -> dict:
        self.trades = trades
        if not trades:
            print("No trades generated.")
            return {}

        capital = self.cfg.initial_capital
        df = RiskManager(self.cfg).trade_summary(trades)
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date")

        # Daily P&L
        daily_pnl = df.groupby("date")["pnl"].sum()

        # Build full equity curve (including days with no trades)
        all_dates = pd.date_range(daily_pnl.index.min(), daily_pnl.index.max(), freq="B")
        daily_pnl = daily_pnl.reindex(all_dates, fill_value=0.0)
        equity = (daily_pnl.cumsum() + capital)
        self.equity_curve = equity

        metrics = self._compute_metrics(equity, daily_pnl, df)
        return metrics

    def _compute_metrics(
        self,
        equity: pd.Series,
        daily_pnl: pd.Series,
        trade_df: pd.DataFrame,
    ) -> dict:
        capital = self.cfg.initial_capital
        final_equity = equity.iloc[-1]
        total_return = (final_equity - capital) / capital

        n_days = len(daily_pnl)
        n_years = n_days / 252
        cagr = (final_equity / capital) ** (1 / max(n_years, 1e-6)) - 1

        daily_returns = daily_pnl / equity.shift(1).fillna(capital)

        # Sharpe (annualized, risk-free = 0 for simplicity)
        sharpe = (
            daily_returns.mean() / daily_returns.std() * math.sqrt(252)
            if daily_returns.std() > 0 else 0.0
        )

        # Sortino (downside deviation)
        neg_returns = daily_returns[daily_returns < 0]
        downside_std = neg_returns.std() if len(neg_returns) > 1 else 1e-9
        sortino = (daily_returns.mean() / downside_std * math.sqrt(252)) if downside_std > 0 else 0.0

        # Max Drawdown
        rolling_max = equity.cummax()
        drawdown = (equity - rolling_max) / rolling_max
        max_dd = drawdown.min()

        # Calmar
        calmar = cagr / abs(max_dd) if max_dd != 0 else 0.0

        # Trade-level stats
        n_trades = len(trade_df)
        wins = trade_df[trade_df["pnl"] > 0]
        losses = trade_df[trade_df["pnl"] <= 0]
        win_rate = len(wins) / n_trades if n_trades > 0 else 0.0

        gross_profit = wins["pnl"].sum() if not wins.empty else 0.0
        gross_loss   = abs(losses["pnl"].sum()) if not losses.empty else 1e-9
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0.0

        avg_r = trade_df["r_multiple"].mean() if n_trades > 0 else 0.0

        # Monthly returns for heatmap
        monthly = equity.resample("ME").last().pct_change().dropna()
        monthly_df = monthly.to_frame("return")
        monthly_df["year"]  = monthly_df.index.year
        monthly_df["month"] = monthly_df.index.month
        heatmap_data = monthly_df.pivot_table(
            index="year", columns="month", values="return", aggfunc="sum"
        )

        return {
            "total_return": total_return,
            "cagr": cagr,
            "sharpe": sharpe,
            "sortino": sortino,
            "max_drawdown": max_dd,
            "calmar": calmar,
            "n_trades": n_trades,
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "avg_r_multiple": avg_r,
            "gross_profit": gross_profit,
            "gross_loss": gross_loss,
            "final_equity": final_equity,
            "equity_curve": equity,
            "daily_pnl": daily_pnl,
            "drawdown_series": drawdown,
            "monthly_heatmap": heatmap_data,
            "trade_df": trade_df,
        }


# ---------------------------------------------------------------------------
# Reporter
# ---------------------------------------------------------------------------

class Reporter:
    """Prints performance report to console and plots equity curve."""

    MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun",
                   "Jul","Aug","Sep","Oct","Nov","Dec"]

    @staticmethod
    def print_report(metrics: dict, ticker: str) -> None:
        if not metrics:
            return
        sep = "─" * 60
        print(f"\n{'═'*60}")
        print(f"  BACKTEST REPORT — {ticker}")
        print(f"{'═'*60}")
        print(f"  Total Return       : {metrics['total_return']:>10.2%}")
        print(f"  CAGR               : {metrics['cagr']:>10.2%}")
        print(f"  Sharpe Ratio       : {metrics['sharpe']:>10.2f}")
        print(f"  Sortino Ratio      : {metrics['sortino']:>10.2f}")
        print(f"  Max Drawdown       : {metrics['max_drawdown']:>10.2%}")
        print(f"  Calmar Ratio       : {metrics['calmar']:>10.2f}")
        print(sep)
        print(f"  Total Trades       : {metrics['n_trades']:>10}")
        print(f"  Win Rate           : {metrics['win_rate']:>10.2%}")
        print(f"  Profit Factor      : {metrics['profit_factor']:>10.2f}")
        print(f"  Avg R-Multiple     : {metrics['avg_r_multiple']:>10.2f}R")
        print(f"  Gross Profit       : {metrics['gross_profit']:>10,.2f}")
        print(f"  Gross Loss         : {metrics['gross_loss']:>10,.2f}")
        print(sep)
        print(f"  Final Equity       : {metrics['final_equity']:>10,.2f}")
        print(f"{'═'*60}\n")

        # Monthly returns table
        heatmap = metrics.get("monthly_heatmap")
        if heatmap is not None and not heatmap.empty:
            print("  Monthly Returns (%):")
            print("  " + "  ".join(f"{m:>6}" for m in Reporter.MONTH_NAMES))
            for year, row in heatmap.iterrows():
                vals = []
                for m in range(1, 13):
                    v = row.get(m, float("nan"))
                    if pd.isna(v):
                        vals.append("      ")
                    else:
                        vals.append(f"{v*100:>+6.1f}")
                print(f"  {'  '.join(vals)}  {year}")
            print()

    @staticmethod
    def plot(metrics: dict, ticker: str, save_path: Optional[str] = None) -> None:
        """Plot equity curve, drawdown, and monthly heatmap."""
        if not metrics:
            return

        equity    = metrics["equity_curve"]
        drawdown  = metrics["drawdown_series"]
        heatmap   = metrics["monthly_heatmap"]

        fig = plt.figure(figsize=(16, 10))
        fig.suptitle(f"ORB+VWAP Backtest — {ticker}", fontsize=14, fontweight="bold")
        gs = gridspec.GridSpec(3, 1, height_ratios=[3, 1.5, 2], hspace=0.4)

        # ── Equity curve ──
        ax1 = fig.add_subplot(gs[0])
        ax1.plot(equity.index, equity.values, color="#2196F3", linewidth=1.5, label="Equity")
        ax1.axhline(equity.iloc[0], color="gray", linestyle="--", linewidth=0.8, alpha=0.6)
        ax1.fill_between(equity.index, equity.iloc[0], equity.values,
                         where=equity.values >= equity.iloc[0],
                         alpha=0.15, color="#4CAF50")
        ax1.fill_between(equity.index, equity.iloc[0], equity.values,
                         where=equity.values < equity.iloc[0],
                         alpha=0.15, color="#F44336")
        ax1.set_ylabel("Portfolio Value (€)")
        ax1.set_title("Equity Curve")
        ax1.legend(loc="upper left")
        ax1.grid(True, alpha=0.3)

        # ── Drawdown ──
        ax2 = fig.add_subplot(gs[1], sharex=ax1)
        ax2.fill_between(drawdown.index, drawdown.values, 0,
                         color="#F44336", alpha=0.6)
        ax2.set_ylabel("Drawdown %")
        ax2.set_title("Drawdown")
        ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda y, _: f"{y:.0%}"))
        ax2.grid(True, alpha=0.3)

        # ── Monthly heatmap ──
        ax3 = fig.add_subplot(gs[2])
        if heatmap is not None and not heatmap.empty:
            # Fill missing months
            heatmap_full = heatmap.reindex(columns=range(1, 13))
            data = heatmap_full.values.astype(float)
            vmax = max(abs(np.nanmax(data)), abs(np.nanmin(data)), 0.01)
            norm = TwoSlopeNorm(vmin=-vmax, vcenter=0, vmax=vmax)
            im = ax3.imshow(data, aspect="auto", cmap="RdYlGn", norm=norm,
                            interpolation="nearest")
            ax3.set_xticks(range(12))
            ax3.set_xticklabels(Reporter.MONTH_NAMES, fontsize=8)
            ax3.set_yticks(range(len(heatmap.index)))
            ax3.set_yticklabels([str(y) for y in heatmap.index], fontsize=8)
            ax3.set_title("Monthly Returns Heatmap")
            for r in range(data.shape[0]):
                for c in range(data.shape[1]):
                    v = data[r, c]
                    if not np.isnan(v):
                        ax3.text(c, r, f"{v*100:.1f}%", ha="center", va="center",
                                 fontsize=7, color="black", fontweight="bold")
            plt.colorbar(im, ax=ax3, orientation="vertical", fraction=0.02,
                         format=plt.FuncFormatter(lambda x, _: f"{x:.0%}"))
        else:
            ax3.text(0.5, 0.5, "Insufficient data for heatmap",
                     ha="center", va="center", transform=ax3.transAxes)

        plt.tight_layout()
        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches="tight")
            print(f"  Chart saved → {save_path}")
        else:
            plt.show()


# ---------------------------------------------------------------------------
# TradingSystem — top-level orchestrator
# ---------------------------------------------------------------------------

class TradingSystem:
    """Main entry point.

    Usage:
        ts = TradingSystem()
        results = ts.backtest("SPY", period="2y")
        ts.report(results, "SPY")
    """

    def __init__(self, config: Optional[SystemConfig] = None):
        self.cfg     = config or SystemConfig()
        self.fetcher = DataFetcher()
        self.risk    = RiskManager(self.cfg)

    def backtest(
        self,
        ticker: str,
        period: str = "2y",
        interval: str = "15m",
        tz: str = "America/New_York",
    ) -> dict:
        """Run full backtest pipeline for a single ticker."""
        print(f"\n{'─'*60}")
        print(f"  Running backtest: {ticker} | {period} | {interval}")
        print(f"{'─'*60}")

        df = self.fetcher.fetch_intraday(ticker, period=period, interval=interval, tz=tz)

        strategy = ORBStrategy(self.cfg)
        raw_trades = strategy.generate_signals(df, ticker)
        print(f"  Raw signals generated  : {len(raw_trades)}")

        filtered_trades = self.risk.apply_daily_loss_limit(raw_trades)
        print(f"  Trades after risk filter: {len(filtered_trades)}")

        bt = Backtester(self.cfg)
        metrics = bt.run(filtered_trades)
        return metrics

    def report(
        self,
        metrics: dict,
        ticker: str,
        plot: bool = True,
        save_chart: Optional[str] = None,
    ) -> None:
        Reporter.print_report(metrics, ticker)
        if plot and metrics:
            Reporter.plot(metrics, ticker, save_path=save_chart)

    def backtest_portfolio(
        self,
        tickers: list[str],
        period: str = "2y",
        interval: str = "15m",
        tz_map: Optional[dict[str, str]] = None,
    ) -> dict[str, dict]:
        """Run backtests for multiple tickers and print combined summary."""
        tz_map = tz_map or {}
        all_results: dict[str, dict] = {}

        for ticker in tickers:
            tz = tz_map.get(ticker, "America/New_York")
            try:
                results = self.backtest(ticker, period=period, interval=interval, tz=tz)
                all_results[ticker] = results
                self.report(results, ticker, plot=False)
            except Exception as e:
                print(f"  [ERROR] {ticker}: {e}")

        # Combined summary table
        print(f"\n{'═'*70}")
        print(f"  PORTFOLIO SUMMARY")
        print(f"{'═'*70}")
        header = f"  {'Ticker':<8} {'Return':>9} {'CAGR':>8} {'Sharpe':>8} "
        header += f"{'MaxDD':>9} {'Trades':>7} {'WinRate':>9} {'PF':>6}"
        print(header)
        print(f"  {'─'*66}")
        for ticker, m in all_results.items():
            if not m:
                continue
            print(
                f"  {ticker:<8} "
                f"{m['total_return']:>9.2%} "
                f"{m['cagr']:>8.2%} "
                f"{m['sharpe']:>8.2f} "
                f"{m['max_drawdown']:>9.2%} "
                f"{m['n_trades']:>7} "
                f"{m['win_rate']:>9.2%} "
                f"{m['profit_factor']:>6.2f}"
            )
        print(f"{'═'*70}\n")
        return all_results


# =============================================================================
# EXAMPLE USAGE — run with: python trading_system.py
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("  ORB + VWAP Intraday Trading System")
    print("  Capital: €20,000 | Risk: 1%/trade | No overnight")
    print("=" * 60)

    # Custom config (tweak as needed)
    config = SystemConfig(
        initial_capital=20_000.0,
        max_risk_per_trade=0.01,
        daily_loss_limit_pct=0.02,
        max_trades_per_session=3,
        orb_minutes=15,
        vwap_filter=True,
        volume_surge_multiplier=1.5,
        volume_lookback=20,
        atr_period=14,
        stop_atr_multiplier=1.0,
        target_atr_multiplier=1.5,
        min_rr_ratio=1.5,
    )

    ts = TradingSystem(config=config)

    # Timezone map: US proxies → Eastern, EU proxy → CET
    tz_map = {
        "SPY": "America/New_York",
        "QQQ": "America/New_York",
        "EWG": "Europe/Berlin",   # iShares MSCI Germany ETF (DAX proxy)
    }

    # Run portfolio backtest — last 2 years, 15-min bars
    all_results = ts.backtest_portfolio(
        tickers=["SPY", "QQQ", "EWG"],
        period="2y",
        interval="15m",
        tz_map=tz_map,
    )

    # Plot individual equity curves for each instrument
    for ticker, metrics in all_results.items():
        if metrics:
            Reporter.plot(
                metrics,
                ticker,
                save_path=f"backtest_{ticker.lower()}.png",
            )

    print("Done. Charts saved as backtest_*.png")

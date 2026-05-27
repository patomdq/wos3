# =============================================================================
# SWING TRADING SYSTEM — FMP EOD Data + Momentum/Mean-Reversion
# =============================================================================
# Requirements:
#   pip install pandas numpy matplotlib requests python-dotenv
#
# Setup:
#   export FMP_API_KEY=tu_api_key   (o ponlo en .env)
#
# Uso:
#   python scripts/fmp_swing_system.py
#
# Call budget: ~1 call por símbolo por backtest. Con 250 calls/mes:
#   - 30 calls para backtests históricos (reserva)
#   - 60 calls para scanner diario (3 endpoints × 20 días)
#   - 100 calls para quotes de candidatos
#   - 60 calls buffer
# =============================================================================

from __future__ import annotations

import os
import json
import warnings
import math
from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import requests
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.colors import TwoSlopeNorm

warnings.filterwarnings("ignore")

try:
    from dotenv import load_dotenv
    from pathlib import Path
    _root = Path(__file__).parent.parent
    load_dotenv(_root / ".env.local")
    load_dotenv(_root / ".env")  # fallback
except ImportError:
    pass

FMP_BASE = "https://financialmodelingprep.com/api/v3"
FMP_API_KEY = os.getenv("FMP_API_KEY", "")

# ---------------------------------------------------------------------------
# Call Budget Tracker
# ---------------------------------------------------------------------------

class CallBudget:
    """Tracks FMP API calls to stay within the 250/month free limit."""

    def __init__(self, monthly_limit: int = 250):
        self.limit = monthly_limit
        self.used = 0
        self._log: list[dict] = []

    def charge(self, endpoint: str, n: int = 1) -> bool:
        if self.used + n > self.limit:
            print(f"⚠️  Budget agotado: {self.used}/{self.limit} calls usados. Endpoint: {endpoint}")
            return False
        self.used += n
        self._log.append({"endpoint": endpoint, "calls": n, "total": self.used})
        return True

    def status(self) -> str:
        remaining = self.limit - self.used
        pct = self.used / self.limit * 100
        return f"FMP Calls: {self.used}/{self.limit} usados ({pct:.0f}%) — {remaining} restantes"

BUDGET = CallBudget(monthly_limit=250)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class SwingConfig:
    # Account
    initial_capital: float = 20_000.0
    max_risk_per_trade: float = 0.015      # 1.5% por operación
    daily_loss_limit_pct: float = 0.03    # −3% corta el día
    max_positions: int = 3                 # posiciones simultáneas

    # Filtros de calidad (screener)
    min_price: float = 10.0               # sin penny stocks
    min_avg_volume: int = 500_000         # liquidez mínima
    max_price: float = 1500.0            # evitar acciones muy caras (futuros mejor)

    # Estrategia Momentum Breakout
    momentum_lookback: int = 20           # breakout sobre máximo de N días
    momentum_volume_mult: float = 1.5    # volumen > 1.5× media para confirmar
    momentum_volume_ma: int = 20

    # Estrategia Mean Reversion
    rsi_period: int = 14
    rsi_oversold: float = 35.0           # RSI < 35 para entrada long
    rsi_overbought: float = 65.0         # RSI > 65 para entrada short
    sma_trend_period: int = 50           # solo operar en dirección de la SMA50

    # Gestión de riesgo
    atr_period: int = 14
    stop_atr_mult: float = 1.5           # stop = 1.5× ATR desde entrada
    target_atr_mult: float = 3.0         # target = 3× ATR (R:R 2:1)
    max_hold_days: int = 10              # cierre forzado a N días

    # Datos
    lookback_years: int = 2              # años de historia para backtest


# ---------------------------------------------------------------------------
# FMP Data Fetcher (EOD — gratuito)
# ---------------------------------------------------------------------------

class FMPDataFetcher:
    """
    Descarga datos EOD de FMP.
    1 call = 1 símbolo. Usa el budget tracker automáticamente.
    """

    _cache: dict[str, pd.DataFrame] = {}

    @classmethod
    def fetch_eod(
        cls,
        symbol: str,
        years: int = 2,
        budget: CallBudget = BUDGET,
    ) -> Optional[pd.DataFrame]:
        cache_key = f"{symbol}_{years}"
        if cache_key in cls._cache:
            return cls._cache[cache_key]

        if not FMP_API_KEY:
            raise EnvironmentError(
                "FMP_API_KEY no está configurada.\n"
                "Exporta: export FMP_API_KEY=tu_key\n"
                "O agrega FMP_API_KEY=tu_key en el archivo .env"
            )

        if not budget.charge(f"historical-price-eod-full/{symbol}"):
            return None

        to_date = date.today().isoformat()
        from_date = (date.today() - timedelta(days=365 * years + 30)).isoformat()

        url = (
            f"https://financialmodelingprep.com/stable/historical-price-eod/full"
            f"?symbol={symbol}&from={from_date}&to={to_date}&apikey={FMP_API_KEY}"
        )

        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  [ERROR] FMP fetch {symbol}: {e}")
            return None

        records = data if isinstance(data, list) else data.get("historical", [])
        if not records:
            print(f"  [WARN] Sin datos para {symbol}")
            return None

        df = pd.DataFrame(records)
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").reset_index(drop=True)

        required = {"date", "open", "high", "low", "close", "volume"}
        if not required.issubset(df.columns):
            print(f"  [WARN] Columnas faltantes en {symbol}: {df.columns.tolist()}")
            return None

        df = df[["date", "open", "high", "low", "close", "volume"]].copy()
        df[["open", "high", "low", "close", "volume"]] = df[
            ["open", "high", "low", "close", "volume"]
        ].apply(pd.to_numeric, errors="coerce")
        df = df.dropna()

        cls._cache[cache_key] = df
        return df

    @classmethod
    def from_dict_list(cls, records: list[dict], symbol: str = "MANUAL") -> pd.DataFrame:
        """
        Crea un DataFrame desde datos ya descargados (ej: datos del MCP de Claude).
        Útil cuando Claude ya hizo la llamada FMP y te pasó el resultado.
        """
        df = pd.DataFrame(records)
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").reset_index(drop=True)
        cols = ["date", "open", "high", "low", "close", "volume"]
        available = [c for c in cols if c in df.columns]
        df = df[available].copy()
        df[available[1:]] = df[available[1:]].apply(pd.to_numeric, errors="coerce")
        return df.dropna()


# ---------------------------------------------------------------------------
# Indicators (vectorized)
# ---------------------------------------------------------------------------

class Indicators:

    @staticmethod
    def true_range(df: pd.DataFrame) -> pd.Series:
        h, l, cp = df["high"], df["low"], df["close"].shift(1)
        return pd.concat([h - l, (h - cp).abs(), (l - cp).abs()], axis=1).max(axis=1)

    @staticmethod
    def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
        tr = Indicators.true_range(df)
        return tr.ewm(span=period, adjust=False).mean()

    @staticmethod
    def rsi(series: pd.Series, period: int = 14) -> pd.Series:
        delta = series.diff()
        gain = delta.clip(lower=0).ewm(span=period, adjust=False).mean()
        loss = (-delta.clip(upper=0)).ewm(span=period, adjust=False).mean()
        rs = gain / loss.replace(0, np.nan)
        return 100 - (100 / (1 + rs))

    @staticmethod
    def sma(series: pd.Series, period: int) -> pd.Series:
        return series.rolling(period).mean()

    @staticmethod
    def ema(series: pd.Series, period: int) -> pd.Series:
        return series.ewm(span=period, adjust=False).mean()

    @staticmethod
    def volume_ma(df: pd.DataFrame, period: int = 20) -> pd.Series:
        return df["volume"].rolling(period).mean()

    @staticmethod
    def add_all(df: pd.DataFrame, cfg: SwingConfig) -> pd.DataFrame:
        df = df.copy()
        df["atr"] = Indicators.atr(df, cfg.atr_period)
        df["rsi"] = Indicators.rsi(df["close"], cfg.rsi_period)
        df["sma50"] = Indicators.sma(df["close"], cfg.sma_trend_period)
        df["sma20"] = Indicators.sma(df["close"], cfg.momentum_lookback)
        df["vol_ma20"] = Indicators.volume_ma(df, cfg.momentum_volume_ma)
        df["high20"] = df["high"].rolling(cfg.momentum_lookback).max().shift(1)
        df["low20"] = df["low"].rolling(cfg.momentum_lookback).min().shift(1)
        return df


# ---------------------------------------------------------------------------
# Swing Momentum Strategy
# ---------------------------------------------------------------------------

class SwingMomentumStrategy:
    """
    Dos sub-estrategias combinadas:

    A) MOMENTUM BREAKOUT
       Entrada: Close > high20 AND volume > vol_ma20 × 1.5 AND close > sma50
       Dirección: long
       Stop: entry − 1.5×ATR | Target: entry + 3×ATR

    B) MEAN REVERSION (RSI Dip)
       Entrada: RSI < 35 AND close > sma50 (tendencia alcista)
       Dirección: long (contra movimiento pero con trend)
       Stop: entry − 1.5×ATR | Target: entry + 3×ATR
    """

    def __init__(self, cfg: SwingConfig):
        self.cfg = cfg

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        """Returns df with columns: signal (1=long, -1=short, 0=flat), strategy."""
        df = Indicators.add_all(df, self.cfg)
        c = self.cfg

        # Filtro de calidad
        price_ok = (df["close"] >= c.min_price) & (df["close"] <= c.max_price)

        # Momentum Breakout
        mom_long = (
            (df["close"] > df["high20"])
            & (df["volume"] > df["vol_ma20"] * c.momentum_volume_mult)
            & (df["close"] > df["sma50"])
            & price_ok
        )

        # RSI Mean Reversion
        rsi_long = (
            (df["rsi"] < c.rsi_oversold)
            & (df["close"] > df["sma50"])
            & price_ok
        )

        df["signal"] = 0
        df["strategy"] = ""
        df.loc[mom_long, "signal"] = 1
        df.loc[mom_long, "strategy"] = "momentum"
        # RSI only where no momentum signal
        df.loc[rsi_long & (df["signal"] == 0), "signal"] = 1
        df.loc[rsi_long & (df["strategy"] == ""), "strategy"] = "rsi_dip"

        return df

    def simulate_trades(self, df: pd.DataFrame) -> list[dict]:
        """Walk-forward trade simulation with ATR stops and max-hold exit."""
        df = self.generate_signals(df)
        c = self.cfg

        trades: list[dict] = []
        in_trade = False
        entry_price = stop = target = 0.0
        entry_date = None
        entry_idx = 0
        entry_strategy = ""

        for i, row in df.iterrows():
            if not in_trade:
                if row["signal"] == 1 and not pd.isna(row["atr"]):
                    in_trade = True
                    entry_price = row["open"]  # enter next open
                    entry_date = row["date"]
                    entry_idx = i
                    entry_strategy = row["strategy"]
                    stop = entry_price - c.stop_atr_mult * row["atr"]
                    target = entry_price + c.target_atr_mult * row["atr"]
            else:
                days_held = i - entry_idx
                exit_price = None
                exit_reason = ""

                if row["low"] <= stop:
                    exit_price = stop
                    exit_reason = "stop"
                elif row["high"] >= target:
                    exit_price = target
                    exit_reason = "target"
                elif days_held >= c.max_hold_days:
                    exit_price = row["close"]
                    exit_reason = "timeout"

                if exit_price is not None:
                    pnl_pct = (exit_price - entry_price) / entry_price
                    trades.append({
                        "entry_date": entry_date,
                        "exit_date": row["date"],
                        "entry_price": entry_price,
                        "exit_price": exit_price,
                        "pnl_pct": pnl_pct,
                        "days_held": days_held,
                        "exit_reason": exit_reason,
                        "strategy": entry_strategy,
                    })
                    in_trade = False

        return trades


# ---------------------------------------------------------------------------
# Risk Manager (position sizing)
# ---------------------------------------------------------------------------

class RiskManager:

    def __init__(self, cfg: SwingConfig):
        self.cfg = cfg

    def apply(self, trades: list[dict], capital: float) -> pd.DataFrame:
        if not trades:
            return pd.DataFrame()

        records = []
        current_capital = capital

        for t in trades:
            risk_amount = current_capital * self.cfg.max_risk_per_trade
            # Size = risk_amount / (stop distance as fraction of entry)
            stop_pct = self.cfg.stop_atr_mult * 0.02  # approx 2% of price per ATR
            position_size = risk_amount / (t["entry_price"] * stop_pct)
            pnl_dollars = position_size * t["entry_price"] * t["pnl_pct"]
            current_capital += pnl_dollars

            records.append({
                **t,
                "position_size": position_size,
                "pnl_dollars": pnl_dollars,
                "capital_after": current_capital,
            })

        return pd.DataFrame(records)


# ---------------------------------------------------------------------------
# Backtester & Metrics
# ---------------------------------------------------------------------------

class Backtester:

    @staticmethod
    def run(
        symbol: str,
        df: pd.DataFrame,
        cfg: SwingConfig,
        initial_capital: float,
    ) -> dict:
        strategy = SwingMomentumStrategy(cfg)
        trades_raw = strategy.simulate_trades(df)

        rm = RiskManager(cfg)
        trades_df = rm.apply(trades_raw, initial_capital)

        if trades_df.empty:
            return {
                "symbol": symbol,
                "n_trades": 0,
                "total_return": 0.0,
                "cagr": 0.0,
                "sharpe": 0.0,
                "sortino": 0.0,
                "max_drawdown": 0.0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "avg_r_multiple": 0.0,
                "calmar": 0.0,
                "avg_hold_days": 0.0,
                "trades_df": trades_df,
                "equity_curve": pd.Series([initial_capital]),
            }

        equity = pd.concat(
            [pd.Series([initial_capital]), trades_df["capital_after"]]
        ).reset_index(drop=True)

        total_return = (equity.iloc[-1] - initial_capital) / initial_capital
        date_range = (
            trades_df["exit_date"].max() - trades_df["entry_date"].min()
        ).days / 365.25
        cagr = (equity.iloc[-1] / initial_capital) ** (1 / max(date_range, 0.1)) - 1

        daily_rets = equity.pct_change().dropna()
        sharpe = (daily_rets.mean() / daily_rets.std() * math.sqrt(252)) if daily_rets.std() > 0 else 0.0
        neg = daily_rets[daily_rets < 0]
        sortino = (daily_rets.mean() / neg.std() * math.sqrt(252)) if len(neg) > 0 and neg.std() > 0 else 0.0

        roll_max = equity.cummax()
        dd = (equity - roll_max) / roll_max
        max_dd = dd.min()
        calmar = cagr / abs(max_dd) if max_dd != 0 else 0.0

        winners = trades_df[trades_df["pnl_dollars"] > 0]
        losers = trades_df[trades_df["pnl_dollars"] <= 0]
        win_rate = len(winners) / len(trades_df)
        gross_profit = winners["pnl_dollars"].sum()
        gross_loss = abs(losers["pnl_dollars"].sum())
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

        risk_per_trade = initial_capital * cfg.max_risk_per_trade
        avg_r = trades_df["pnl_dollars"].mean() / risk_per_trade if risk_per_trade > 0 else 0.0

        return {
            "symbol": symbol,
            "n_trades": len(trades_df),
            "total_return": total_return,
            "cagr": cagr,
            "sharpe": sharpe,
            "sortino": sortino,
            "max_drawdown": max_dd,
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "avg_r_multiple": avg_r,
            "calmar": calmar,
            "avg_hold_days": trades_df["days_held"].mean(),
            "momentum_trades": len(trades_df[trades_df["strategy"] == "momentum"]),
            "rsi_trades": len(trades_df[trades_df["strategy"] == "rsi_dip"]),
            "trades_df": trades_df,
            "equity_curve": equity,
        }


# ---------------------------------------------------------------------------
# Reporter
# ---------------------------------------------------------------------------

class Reporter:

    @staticmethod
    def print_report(metrics: dict) -> None:
        sym = metrics["symbol"]
        print(f"\n{'═'*60}")
        print(f"  {sym} — Swing Backtest Results")
        print(f"{'═'*60}")
        print(f"  Total Return     : {metrics['total_return']:>10.2%}")
        print(f"  CAGR             : {metrics['cagr']:>10.2%}")
        print(f"  Sharpe Ratio     : {metrics['sharpe']:>10.2f}")
        print(f"  Sortino Ratio    : {metrics['sortino']:>10.2f}")
        print(f"  Max Drawdown     : {metrics['max_drawdown']:>10.2%}")
        print(f"  Calmar Ratio     : {metrics['calmar']:>10.2f}")
        print(f"  Win Rate         : {metrics['win_rate']:>10.2%}")
        print(f"  Profit Factor    : {metrics['profit_factor']:>10.2f}")
        print(f"  Avg R Multiple   : {metrics['avg_r_multiple']:>10.2f}R")
        print(f"  Avg Hold Days    : {metrics['avg_hold_days']:>10.1f}")
        print(f"  Total Trades     : {metrics['n_trades']:>10}")
        if "momentum_trades" in metrics:
            print(f"    · Momentum     : {metrics['momentum_trades']:>10}")
            print(f"    · RSI Dip      : {metrics['rsi_trades']:>10}")
        print(f"{'─'*60}")

    @staticmethod
    def plot(metrics: dict, save_path: Optional[str] = None) -> None:
        sym = metrics["symbol"]
        equity = metrics["equity_curve"]
        trades_df = metrics.get("trades_df", pd.DataFrame())

        fig = plt.figure(figsize=(14, 9))
        fig.suptitle(f"{sym} — Swing Momentum System", fontsize=14, fontweight="bold")
        gs = gridspec.GridSpec(3, 2, figure=fig, hspace=0.45, wspace=0.35)

        # Equity curve
        ax1 = fig.add_subplot(gs[0, :])
        ax1.plot(equity.values, color="#2196F3", lw=2)
        ax1.set_title("Equity Curve")
        ax1.set_ylabel("Capital (€)")
        ax1.grid(alpha=0.3)

        # Drawdown
        ax2 = fig.add_subplot(gs[1, :])
        roll_max = equity.cummax()
        dd = (equity - roll_max) / roll_max * 100
        ax2.fill_between(range(len(dd)), dd.values, 0, color="#F44336", alpha=0.6)
        ax2.set_title("Drawdown (%)")
        ax2.set_ylabel("%")
        ax2.grid(alpha=0.3)

        if not trades_df.empty:
            # PnL distribution
            ax3 = fig.add_subplot(gs[2, 0])
            wins = trades_df[trades_df["pnl_dollars"] > 0]["pnl_dollars"]
            losses = trades_df[trades_df["pnl_dollars"] <= 0]["pnl_dollars"]
            ax3.hist(wins, bins=20, color="#4CAF50", alpha=0.7, label="Winners")
            ax3.hist(losses, bins=20, color="#F44336", alpha=0.7, label="Losers")
            ax3.set_title("P&L Distribution")
            ax3.legend(fontsize=8)
            ax3.grid(alpha=0.3)

            # Exit reasons
            ax4 = fig.add_subplot(gs[2, 1])
            reason_counts = trades_df["exit_reason"].value_counts()
            colors = {"target": "#4CAF50", "stop": "#F44336", "timeout": "#FF9800"}
            bar_colors = [colors.get(r, "#999") for r in reason_counts.index]
            ax4.bar(reason_counts.index, reason_counts.values, color=bar_colors)
            ax4.set_title("Exit Reasons")
            ax4.grid(alpha=0.3, axis="y")

        plt.tight_layout()
        if save_path:
            plt.savefig(save_path, dpi=120, bbox_inches="tight")
            print(f"  Chart guardado: {save_path}")
        plt.close()


# ---------------------------------------------------------------------------
# Daily Scanner (filtra candidatos de calidad)
# ---------------------------------------------------------------------------

class DailyScanner:
    """
    Toma datos brutos de FMP (gainers, losers, most-active) y
    filtra candidatos operables con criterios de calidad.

    Uso: pasar las listas que Claude obtiene del MCP de FMP.
    """

    QUALITY_FILTERS = {
        "min_price": 10.0,         # sin penny stocks
        "max_pct_change": 30.0,    # ignora movimientos >30% (pump & dump)
        "min_pct_change": 3.0,     # mínimo momentum para considerar
        "excluded_keywords": [     # ETFs apalancados, warrants, SPACs
            "2X", "3X", "Bear", "Bull", "Ultra", "Rights", "Acquisition",
            "Warrant", "SPAC", "Preferred", "Unit"
        ],
        "preferred_exchanges": ["NASDAQ", "NYSE"],  # excluye AMEX micro-caps
    }

    @classmethod
    def filter(cls, raw_list: list[dict], direction: str = "long") -> list[dict]:
        """
        direction: 'long' para gainers, 'short' para losers
        """
        f = cls.QUALITY_FILTERS
        filtered = []

        for item in raw_list:
            price = item.get("price", 0)
            pct = abs(item.get("changesPercentage", 0))
            name = item.get("name", "")
            exchange = item.get("exchange", "")

            # Filtros de precio
            if price < f["min_price"]:
                continue

            # Filtros de % cambio
            if pct > f["max_pct_change"]:
                continue
            if pct < f["min_pct_change"]:
                continue

            # Filtro de exchange
            if exchange not in f["preferred_exchanges"]:
                continue

            # Filtro de nombre (excluye apalancados, SPACs, warrants)
            if any(kw.lower() in name.lower() for kw in f["excluded_keywords"]):
                continue

            filtered.append(item)

        # Ordenar por % cambio
        filtered.sort(key=lambda x: abs(x.get("changesPercentage", 0)), reverse=True)
        return filtered

    @classmethod
    def print_watchlist(
        cls,
        gainers: list[dict],
        losers: list[dict],
        most_active: list[dict],
        date_str: Optional[str] = None,
    ) -> list[str]:
        """
        Imprime la watchlist filtrada y devuelve los símbolos seleccionados.
        Llama a este método pasando los datos de las 3 llamadas FMP.
        """
        if not date_str:
            date_str = date.today().strftime("%Y-%m-%d")

        clean_gainers = cls.filter(gainers, "long")
        clean_losers = cls.filter(losers, "short")

        # De most_active, filtra los que cumplen calidad
        active_clean = [
            x for x in most_active
            if x.get("price", 0) >= cls.QUALITY_FILTERS["min_price"]
            and x.get("exchange", "") in cls.QUALITY_FILTERS["preferred_exchanges"]
            and not any(kw.lower() in x.get("name", "").lower()
                        for kw in cls.QUALITY_FILTERS["excluded_keywords"])
        ]

        print(f"\n{'═'*65}")
        print(f"  WATCHLIST — {date_str}")
        print(f"{'═'*65}")

        symbols: list[str] = []

        print(f"\n  🟢 LONGS — Momentum Breakout Candidates:")
        print(f"  {'Símbolo':<8} {'Precio':>8} {'%Cambio':>9}  Nombre")
        print(f"  {'─'*55}")
        for item in clean_gainers[:5]:
            sym = item["symbol"]
            symbols.append(sym)
            print(
                f"  {sym:<8} ${item['price']:>7.2f} "
                f"{item['changesPercentage']:>+8.1f}%  {item['name'][:35]}"
            )

        print(f"\n  🔴 SHORTS — Breakdown Candidates:")
        print(f"  {'Símbolo':<8} {'Precio':>8} {'%Cambio':>9}  Nombre")
        print(f"  {'─'*55}")
        for item in clean_losers[:5]:
            sym = item["symbol"]
            symbols.append(sym)
            print(
                f"  {sym:<8} ${item['price']:>7.2f} "
                f"{item['changesPercentage']:>+8.1f}%  {item['name'][:35]}"
            )

        print(f"\n  📊 VOLUMEN — High-Activity Stocks:")
        print(f"  {'Símbolo':<8} {'Precio':>8} {'%Cambio':>9}  Nombre")
        print(f"  {'─'*55}")
        for item in active_clean[:5]:
            sym = item["symbol"]
            if sym not in symbols:
                symbols.append(sym)
            print(
                f"  {sym:<8} ${item['price']:>7.2f} "
                f"{item['changesPercentage']:>+8.1f}%  {item['name'][:35]}"
            )

        print(f"\n{'─'*65}")
        print(f"  Símbolos seleccionados: {', '.join(symbols)}")
        print(f"  {BUDGET.status()}")
        print(f"{'═'*65}\n")

        return symbols


# ---------------------------------------------------------------------------
# Main System Orchestrator
# ---------------------------------------------------------------------------

class FMPSwingSystem:

    def __init__(self, cfg: Optional[SwingConfig] = None):
        self.cfg = cfg or SwingConfig()

    def backtest(self, symbol: str) -> dict:
        print(f"\n  Descargando datos EOD para {symbol}...")
        df = FMPDataFetcher.fetch_eod(symbol, years=self.cfg.lookback_years)
        if df is None or df.empty:
            print(f"  [SKIP] Sin datos para {symbol}")
            return {}

        print(f"  {len(df)} sesiones cargadas ({df['date'].min().date()} → {df['date'].max().date()})")
        metrics = Backtester.run(symbol, df, self.cfg, self.cfg.initial_capital)
        Reporter.print_report(metrics)
        return metrics

    def backtest_portfolio(self, symbols: list[str]) -> dict[str, dict]:
        results = {}
        for sym in symbols:
            try:
                results[sym] = self.backtest(sym)
            except Exception as e:
                print(f"  [ERROR] {sym}: {e}")
                results[sym] = {}

        print(f"\n{'═'*70}")
        print(f"  PORTFOLIO SUMMARY")
        print(f"{'═'*70}")
        header = f"  {'Ticker':<8} {'Return':>9} {'CAGR':>8} {'Sharpe':>8} {'MaxDD':>9} {'Trades':>7} {'WinRate':>9} {'PF':>6}"
        print(header)
        print(f"  {'─'*65}")
        for sym, m in results.items():
            if not m:
                continue
            print(
                f"  {sym:<8} "
                f"{m['total_return']:>9.2%} "
                f"{m['cagr']:>8.2%} "
                f"{m['sharpe']:>8.2f} "
                f"{m['max_drawdown']:>9.2%} "
                f"{m['n_trades']:>7} "
                f"{m['win_rate']:>9.2%} "
                f"{m['profit_factor']:>6.2f}"
            )
        print(f"{'═'*70}")
        print(f"\n  {BUDGET.status()}\n")
        return results

    def plot_all(self, results: dict[str, dict]) -> None:
        for sym, m in results.items():
            if m and m.get("n_trades", 0) > 0:
                Reporter.plot(m, save_path=f"swing_backtest_{sym.lower()}.png")


# ---------------------------------------------------------------------------
# USAGE EXAMPLE
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  FMP Swing Trading System")
    print("  Capital: €20,000 | Risk: 1.5%/trade | Hold: max 10 días")
    print("=" * 60)

    # --- DEMO 1: Scanner con datos del día de hoy (via MCP de Claude) ---
    # Estos datos los obtienes pidiendo a Claude:
    # "dame los gainers, losers y most-active de hoy via FMP"
    # y pegando los resultados aquí. Ejemplo con datos del 14/05/2026:

    gainers_today = [
        {"symbol": "CSCO", "price": 115.53, "name": "Cisco Systems, Inc.", "changesPercentage": 13.41, "exchange": "NASDAQ"},
        {"symbol": "FIG", "price": 20.24, "name": "Figma, Inc.", "changesPercentage": 6.86, "exchange": "NYSE"},
        {"symbol": "NVDA", "price": 235.74, "name": "NVIDIA Corporation", "changesPercentage": 4.39, "exchange": "NASDAQ"},
        {"symbol": "F", "price": 14.47, "name": "Ford Motor Company", "changesPercentage": 6.63, "exchange": "NYSE"},
        {"symbol": "SOFI", "price": 16.02, "name": "SoFi Technologies, Inc.", "changesPercentage": 4.64, "exchange": "NASDAQ"},
    ]

    losers_today = [
        {"symbol": "DOCS", "price": 18.01, "name": "Doximity, Inc.", "changesPercentage": -23.00, "exchange": "NYSE"},
        {"symbol": "INTC", "price": 115.93, "name": "Intel Corporation", "changesPercentage": -3.62, "exchange": "NASDAQ"},
        {"symbol": "SNAP", "price": 5.36, "name": "Snap Inc.", "changesPercentage": -4.46, "exchange": "NYSE"},
    ]

    most_active_today = [
        {"symbol": "NVDA", "price": 235.74, "name": "NVIDIA Corporation", "changesPercentage": 4.39, "exchange": "NASDAQ"},
        {"symbol": "TSLA", "price": 443.30, "name": "Tesla, Inc.", "changesPercentage": -0.44, "exchange": "NASDAQ"},
        {"symbol": "CSCO", "price": 115.53, "name": "Cisco Systems, Inc.", "changesPercentage": 13.41, "exchange": "NASDAQ"},
        {"symbol": "F", "price": 14.47, "name": "Ford Motor Company", "changesPercentage": 6.63, "exchange": "NYSE"},
        {"symbol": "SPY", "price": 748.17, "name": "SPDR S&P 500 ETF Trust", "changesPercentage": 0.79, "exchange": "NYSE"},
    ]

    watchlist = DailyScanner.print_watchlist(
        gainers=gainers_today,
        losers=losers_today,
        most_active=most_active_today,
        date_str="2026-05-14",
    )

    # --- DEMO 2: Backtest con datos FMP ---
    # Requiere FMP_API_KEY configurada
    if FMP_API_KEY:
        sys = FMPSwingSystem()
        results = sys.backtest_portfolio(["NVDA", "CSCO", "F"])
        sys.plot_all(results)
    else:
        print("  ⚠️  FMP_API_KEY no configurada — backtest omitido.")
        print("  Para activar: export FMP_API_KEY=tu_key")
        print("  Puedes obtener tu key gratuita en: financialmodelingprep.com/developer")

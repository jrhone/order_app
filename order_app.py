import logging
import time, os
import operator
import math
from datetime import datetime, timedelta, timezone
from random import random, seed

# import asyncio
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from kucoin_futures.client import Market as Future, Trade

st.set_page_config(layout="wide")

username = st.text_input('username')
password = st.text_input('password')
if username != st.secrets.auth.username or password != st.secrets.auth.password:
    "Incorrect username/password"
    st.stop()

seed(1)
log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# todo auto pull exisiting positions, create a second app that does websocket stuff and iframe it

api_key = st.secrets['kc']['api_key']
api_secret =  st.secrets['kc']['api_secret']
api_passphrase = st.secrets['kc']['api_passphrase']
kc_futures = Future()  # url='https://api-futures.kucoin.com')
# TODO set to false explicitly?
kc_trade = Trade(api_key, api_secret, api_passphrase) #, is_sandbox=False)

kc_granularities = [
    (1, '1min',),
    (5, '5min',),
    (15, '15min',),
    (30, '30min',),
    (60, '1H',),
    # (120, '2H',),
    (240, '4H',),
    # (480, '8H',),
    (720, '12H',),
    (1440, '1D',),
    (10080, '1W',),
]

htf_ideas = ['', '1w ob', '3d ob', '2d ob', '1d ob', '1w fvg', '3d fvg', '2d fvg', '1d fvg'] # otc
mtf_ideas = ['', '12h ob', '8h ob', '6h ob', '4h ob', '12h fvg', '8h fvg', '6h fvg', '4h fvg']
ltf_ideas = ['', '3h ob', '2h ob', '1h ob', '30m ob', '3h fvg', '2h fvg', '1h fvg', '30m fvg']
confluences = ['', '30m ob', '15m ob', '10m ob', '5m ob', '30m fvg', '15m fvg', '10m fvg', '5m fvg', 'poc']
fib_levels = ['', '.382', '.5', '.618/.65', '.702', '.786', '.83', '.886', '.94/.95'] # otc
liquiditys = ['', 'run stop losses', 'fill imbalance'] # otc
levels = ['', 'daily', 'weekly', 'monthly'] # otc
counter_retails = ['', 'run trendline', 'break equal highs', "run SL's other side of POC"] # otc
entry_types = ['', 'fvg', 'wick', 'fib pullback']
trend_infos = ['', 'with trend', 'against trend']
low_infos = ['', '2 stops back', 'trade idea', 'fvg', 'current low']

sides = ['buy', 'sell']

symbols = ['XBTUSDTM', 'WLDUSDTM', 'MEMEUSDTM', 'GALAUSDTM', 'FLOKIUSDTM', 'VRAUSDTM', 'BIGTIMEUSDTM', 'LQTYUSDTM', 'BLZUSDTM', 'TRBUSDTM', 'RNDRUSDTM', 'PEPEUSDTM', 'SOLUSDTM', 'SHIBUSDTM', 'DOGEUSDTM']
symbol_data = {
    'MEMEUSDTM': {
        'max': 10000,
    },
    'PEPEUSDTM': {
        'max': 5000,
    },
    'XBTUSDTM': {
        'max': 100000,
    },
    'SOLUSDTM': {
        'max': 50000,
        'leverage': 75,
    },
    'TIAUSDTM': {
        'max': 25000,
    },
    'WLDUSDTM': {
        'max': 25000,
    },
    'PYTHUSDTM': {
        'max': 25000,
    },
    'STXUSDTM': {
        'max': 5000,
    },
    'IOTAUSDTM': {
        'max': 5000,
    },
    'OPUSDTM': {
        'max': 5000,
    },
    'LINKUSDTM': {
        'max': 5000,
    },
    'WUSDTM': {
        'max': 100000,
    },
    'FLOKIUSDTM': {
        'max': 100000,
    },
    'LINAUSDTM': {
        'max': 5000,
    },
    'ETHUSDTM': {
        'max': 100000,
    },
    'FETUSDTM': {
        'max': 100000,
    },
    'TAOUSDTM': {
        'max': 5000,
    },
}

api_rate_limit = 5

# Idea: display percentage in stop loss select box

# todo
# off by one error with multiple exits, round up in the calculation
# add breakeven stop with alertatron (https://alertatron.com/docs/automated-trading/trailing-take-profit-order#:~:text=a%20stop%20at-,breakeven,-when%20first%20take)
# if size < 1 for bitcoin it throws an error
# recreate stop orders with reduced size when reduce position
# custom leverage, max position, margin per each token
# use adx for trend, low medium and high tf
# be careful in trades when almost NY close on friday, be sure to TP
# support limit positions on exits?

@st.cache_data(ttl=3600, show_spinner=True)
def get_futures_contracts():
    contracts = kc_futures.get_contracts_list()
    contracts = [c['baseCurrency'] for c in contracts if c['quoteCurrency'] == 'USDT']
    return contracts
# st.write(get_futures_contracts())

def market_hours():
    ny_time = datetime.now(timezone(timedelta(hours=-4)))
    lunch_hour_start = ny_time.replace(hour=11, minute=45, second=0, microsecond=0)
    lunch_hour_end = ny_time.replace(hour=13, minute=30, second=0, microsecond=0)
    is_lunch_hour = lunch_hour_start <= ny_time < lunch_hour_end
    if is_lunch_hour:
        ":no_entry: lunch hour :no_entry:"

def show_psychology():
    st.write("**Trend is your friend.**")
    st.write("**Scared money don't make money!**")
    st.write("**If you see the wick away just enter.**")
    st.write("**Don't be emotional. You planned it. We moving on it.**")

def show_header():
    show_psychology()
    market_hours()

@st.cache_data(show_spinner=True)
def get_contract_detail(symbol):
    detail = kc_futures.get_contract_detail(symbol)
    lotSize = detail['lotSize']
    multiplier = detail['multiplier']
    return lotSize, multiplier

# Extract highs or lows from OHLC data
def find_lows_highs(ohlc_data, pivot, find_highs, ui=None):
    prices = ohlc_data['high' if find_highs else 'low'].values
    next_lows_highs = []

    for i in range(len(prices) - 1, -1, -1):
        condition = (
            (prices[i] <= min(prices[i:]) if not find_highs else prices[i] >= max(prices[i:])) and
            (not pivot or (i == len(prices) - 1 or (i > 0 and
            (prices[i] <= min(prices[i-1:i+2]) if not find_highs else prices[i] >= max(prices[i-1:i+2])))))
        )

        if condition:
            if not next_lows_highs or prices[i] != next_lows_highs[-1][1]:
                next_lows_highs.append((i, prices[i]))

    if ui:
        ui.write([f"Index: {idx}, {'Low' if not find_highs else 'High'} Price: {price}" for idx, price in next_lows_highs])

    return next_lows_highs

def calculate_stop_loss_quantities(total_quantity, share_price, loss_per_stop, stop_loss_percentages):
    # Calculate the risk per share for each stop loss level
    risk_per_share = [share_price * perc for perc in stop_loss_percentages]

    # Calculate the number of shares for each stop loss level
    shares_for_each_stop_loss = [loss_per_stop / risk for risk in risk_per_share]

    # Calculate the total shares from calculated stop losses
    total_shares_from_stop_losses = sum(shares_for_each_stop_loss)

    # Scale the quantities to match the total quantity size
    scaling_factor = total_quantity / total_shares_from_stop_losses
    adjusted_shares = [shares * scaling_factor for shares in shares_for_each_stop_loss]

    return adjusted_shares

def count_decimal_places(number):
    decimal_part = str(number).split('.')[1] if '.' in str(number) else ""
    return len(decimal_part)

# def journal_entry():
#     data = {
#         'trend info': [trend_info],
#         'htf trend': [htf_trend],
#         'mtf trend': [mtf_trend],
#         'ltf trend': [ltf_trend],
#         'date': [datetime.utcnow()],
#         'side': [side],
#         'symbol': [symbol],
#         'timeframe': [timeframe],
#         'low': [low_info],
#         'risk ratio': [risk_ratio],
#         'risk': [f'{risk_with_fees * 100:.3f}%'],
#         'htf idea': [htf_idea],
#         'mtf idea': [mtf_idea],
#         'ltf idea': [ltf_idea],
#         'confluence': [confluence],
#         'fib level': [fib_level],
#         'entry type': [entry_type],
#         'liquidity': [liquidity],
#         'level': [level],
#         'counter_retail': [counter_retail],
#         'chart url': [''],
#         'result': [''],
#     }

#     # Create the DataFrame
#     csv_file_path = 'journal.csv'
#     new_df = pd.DataFrame(data)
#     if not os.path.exists(csv_file_path):
#         new_df.to_csv(csv_file_path, index=False)
#     else:
#         existing_df = pd.read_csv(csv_file_path)
#         combined_df = pd.concat([existing_df, new_df], ignore_index=True)
#         combined_df.to_csv(csv_file_path, index=False)

def place_order(symbol, side, leverage, quantity, low_with_buffer, take_profits, current_price, loss, revenue):
    lotSize, multiplier = get_contract_detail(symbol)
    size = max(int(quantity / lotSize / multiplier), 1)
    decimal_places = count_decimal_places(current_price)

    limit_price = None
    if order_type == 'limit':
        create_order = kc_trade.create_limit_order
        mlp = 1.001 if side == 'buy' else 0.999
        limit_price = round(current_price * mlp, decimal_places)
    else:
        create_order = kc_trade.create_market_order

    order_response = create_order(
        symbol=symbol,
        side=side,
        lever=leverage,
        size=size,
        price=limit_price,
    )

    if "code" in order_response:
        st.write(f"Order placement failed: {order_response['msg']}")
        return
    
    order_id = order_response["orderId"]
    st.write(f"{'Market' if order_type == 'market' else 'Limit'} order placed successfully. Order ID: {order_id}, Current Price: {current_price}")

    # st.write(leverage, size, take_profit, round(take_profit, decimal_places))

    other_side = sides[1] if side == sides[0] else sides[0]

    # tp_stopPrice = round(take_profit, decimal_places)
    # tp_size = size - (size * (running / 100))
    # tp_orders = [(tp_size, tp_stopPrice)]
    # tp_orders

    # if mini_profit:
    #     op = operator.add if side == 'buy' else operator.sub
    #     p = abs(tp_stopPrice - current_price) / risk_ratio
    #     tp_orders = [(tp_size / 2, op(p, current_price)), (tp_size / 2, tp_stopPrice)]
    #     tp_orders

    # # Place the take profit order
    # take_profit_response = kc_trade.create_market_order( # create_order(
    #     symbol=symbol,
    #     # closeOrder=True,
    #     side=other_side,
    #     lever=leverage,
    #     size=size - (size * (running / 100)),
    #     # price=round(take_profit, decimal_places) if order_type == 'limit' else None,
    #     reduceOnly=True,
    #     stop='up' if side == 'buy' else 'down',
    #     stopPrice=round(take_profit, decimal_places),
    #     stopPriceType='TP',
    # )

    stop_loss_percentages = [abs(current_price - tp) / current_price for tp in take_profits]
    loss_per_stop = revenue / len(take_profits)
    quantities = calculate_stop_loss_quantities(size, current_price, loss_per_stop, stop_loss_percentages)
    # sum_gain = sum(stop_loss_percentages)

    # Place the take profit order
    # for tp in take_profits:
    for idx, tp in enumerate(take_profits):

        tp_gain = (abs(current_price - tp) / current_price)
        new_size = quantities[idx]
        tp_gain

        take_profit_response = kc_trade.create_market_order( # create_order(
            symbol=symbol,
            # closeOrder=True,
            side=other_side,
            lever=leverage,
            size=new_size - (new_size * (running / 100)), # (size - (size * (running / 100))) / len(take_profits),
            # price=round(take_profit, decimal_places) if order_type == 'limit' else None,
            reduceOnly=True,
            stop='up' if side == 'buy' else 'down',
            stopPrice=round(tp, decimal_places),
            stopPriceType='TP',
        )

        if "code" in take_profit_response:
            st.write(f"Take profit order placement failed: {take_profit_response['msg']}")
            # Implement error handling or order cancellation if needed
        else:
            st.write(f"Take profit order placed successfully. Price: {round(tp, decimal_places)}, Size: {new_size}")

    stop_loss_percentages = [abs(current_price - tp) / current_price for tp in low_with_buffer]
    loss_per_stop = loss / len(low_with_buffer)
    quantities = calculate_stop_loss_quantities(size, current_price, loss_per_stop, stop_loss_percentages)
    # sum_risk = sum([abs(current_price - sl) / current_price for sl in low_with_buffer])

    # Place the stop loss order
    for idx, sl in enumerate(low_with_buffer):
        sl_risk = (abs(current_price - sl) / current_price)
        new_size = quantities[idx]
        sl_risk

        stop_loss_response = kc_trade.create_market_order( # create_order(
            symbol=symbol,
            # closeOrder=True,
            side=other_side,
            lever=leverage,
            size=new_size, # size / len(low_with_buffer),
            # price=round(low_with_buffer, decimal_places) if order_type == 'limit' else None,
            reduceOnly=True,
            # price=round(low_with_buffer, decimal_places) - 20,
            stop='down' if side == 'buy' else 'up',
            stopPrice=round(sl, decimal_places),
            stopPriceType='TP',
        )

        if "code" in stop_loss_response:
            st.write(f"Stop loss order placement failed: {stop_loss_response['msg']}")
            # Implement error handling or order cancellation if needed
        else:
            st.write(f"Stop loss order placed successfully. Price: {round(sl, decimal_places)}, Size: {new_size}")

    # journal_entry()

def timestamp(dt):
    return dt.replace(tzinfo=timezone.utc).timestamp() * 1000

def get_candlesticks(bars):
    layout = None
    if fifty_width:
        layout = go.Layout(xaxis=dict(range=[100, 200]),
                            yaxis=dict(autorange=True))
    fig = go.Figure(data=[go.Candlestick(x=bars.index,
                    open=bars['open'],
                    high=bars['high'],
                    low=bars['low'],
                    close=bars['close'])],
                    layout=layout)

    fig.update_layout(width=700, height=700)
    return fig

@st.cache_data(ttl=60*15, show_spinner=True)
def get_trend_bars(symbol):
    return _get_bars(symbol, 240)  # 4h

def check_trend(symbol, period, ui=None):
    df = get_trend_bars(symbol)
    df['ema'] = df['close'].ewm(span=period, adjust=False).mean()
    df['ema_slope'] = df['ema'].diff()
    bias = df['ema_slope'].iloc[-1]

    if bias > 0:
        trend = 'Bullish'
    elif bias < 0:
        trend = 'Bearish'
    else:
        trend = 'Neutral'

    if ui:
        ui.write(trend)
    return trend

@st.cache_data(ttl=api_rate_limit, show_spinner=True)
def get_minute_bar(symbol, timeframe):
    return _get_bars(symbol, timeframe)

def _get_bars(symbol, timeframe):
    # Fetch OHLCV data
    kline_data = kc_futures.get_kline_data(
        symbol=symbol,
        granularity=timeframe,
    )
    # st.write('kline')

    # Convert the data to a dataframe
    bars = pd.DataFrame(kline_data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    bars['timestamp'] = pd.to_datetime(bars['timestamp'], unit='ms')
    return bars

def get_bars_and_lows(symbol, timeframe):
    bars = get_minute_bar(symbol, timeframe)
    lows = find_lows_highs(bars, lows_as_pivots, find_highs=True if side == 'sell' else False)
    # todo why min and max equal each other? rangeerror
    max_low = len(lows) if len(lows) > 1 else 2
    # low = selected_low.slider('select low', min_value=1, value=(2, 2) if len(lows) > 1 else (1, 1), max_value=max_low, step=1)
    low = selected_low.number_input('select low', min_value=1, value=2 if len(lows) > 1 else 1, max_value=max_low, step=1)
    low = (low, low)
    return bars, lows, low

def order_dashboard(bars, lows, selected_low, ui):
    current_price = bars['close'].values[-1]
    low_with_buffer = []
    for l in range(selected_low[0], selected_low[1] + 1):
        low = lows[l-1][1]
        if side == 'buy':
            low_with_buffer.append(low - (current_price * stop_loss_buffer))
        else:
            low_with_buffer.append(low + (current_price * stop_loss_buffer))
    avg_low = np.mean(low_with_buffer)
    total_fee_pct = fee_pct * 2 if order_type == 'market' else fee_pct + 0.0006 # limit only applies to the entry
    risk_without_fees = (abs(current_price - avg_low) / current_price)
    risk_with_fees = risk_without_fees + total_fee_pct
    position_size = min(account * (max_risk / risk_with_fees), symbol_data[symbol]["max"])
    quantity = position_size / current_price
    avg_risk_ratio = np.mean([rr for rr in range(risk_ratios[0], risk_ratios[1] + 1)])
    revenue = risk_without_fees * avg_risk_ratio * position_size
    if target:
        # dunno if this is right
        avg_risk_ratio = (abs(target - current_price) / current_price) / risk_without_fees
        revenue = abs(target - current_price) * quantity
    # todo use different position sizes for entry and exit
    fees = position_size * total_fee_pct
    profit = revenue - fees
    loss = risk_with_fees * position_size
    loss_before_fees = risk_without_fees * position_size
    # loss = (profit / risk_ratio) + fees
    if side == 'buy':
        take_profits = [current_price + (risk_without_fees * risk_ratio * current_price) for risk_ratio in range(risk_ratios[0], risk_ratios[1] + 1)]
    else:
        take_profits = [current_price - (risk_without_fees * risk_ratio * current_price) for risk_ratio in range(risk_ratios[0], risk_ratios[1] + 1)]
    if target:
            take_profits = [target]
    # todo should I be re-assigning this? It's passed into the method
    leverage = min(math.ceil(position_size / account), 100)

    msg = [
        # f'account: {account}',
        # f'max risk: {max_risk}',
        # f'low: {low}',
        # f'buffer: {low_with_buffer:.6f}',
        # f'price: {current_price}',
        f'risk: {risk_without_fees * 100:.3f}% is {"ok" if risk_without_fees < max_risk else "large"}',
        f'return: {risk_without_fees * 100 * avg_risk_ratio:.3f}%',
        f'position: {position_size:.2f} is {"ok" if position_size < symbol_data[symbol]["max"] else "large"}',
        f'profit: {profit:.2f}',
        f'loss: {loss:.2f} is {"ok" if loss <= 100 else "large"}',
        # f'revenue: {profit:.2f}',
        # f'risking: {profit / risk_ratio:.2f} is {"ok" if profit / risk_ratio <= 100 else "large"}',
        # f'fees: {fees:.2f}',
        # f'take profit: {take_profit}',
        f'quantity: {quantity:.4f}',
        f'leverage: {leverage} is {"ok" if leverage <= 10 else "large"}',
        # f'rr {math.ceil(0.0025 / risk_with_fees)} to get .25% move',
        f'real rr: {profit / loss:.2f}',
    ]
    ui.write(msg)

    return leverage, quantity, low_with_buffer, take_profits, current_price, loss_before_fees, revenue

def enter_confluences(ui):
    trend_info = ui.selectbox('trend info', trend_infos)

    htf, mtf, ltf, c = ui.columns(4)
    htf_idea = htf.selectbox('htf idea', htf_ideas)
    mtf_idea = mtf.selectbox('mtf idea', mtf_ideas)
    ltf_idea = ltf.selectbox('ltf idea', ltf_ideas)
    confluence = c.selectbox('confluence', confluences)

    fib, liq, lev, cr = ui.columns(4)
    fib_level = fib.selectbox('fib level', fib_levels)
    liquidity = liq.selectbox('liquidity', liquiditys)
    level = lev.selectbox('levels', levels)
    counter_retail = cr.selectbox('retail', counter_retails)

    et, wl = ui.columns(2)
    entry_type = et.selectbox('entry type', entry_types)
    low_info = wl.selectbox('which low', low_infos)
    return htf_idea, mtf_idea, ltf_idea, confluence, entry_type, fib_level, trend_info, low_info, liquidity, level, counter_retail

def get_positions():
    selected_keys = ['symbol', 'currentQty', 'markValue', 'avgEntryPrice', 'markPrice', 'unrealisedPnl', 'realisedPnl']
    positions = kc_trade.get_all_position()
    if isinstance(positions, list):
        df = pd.DataFrame([{key: d[key] for key in selected_keys} for d in positions])
        st.write(df)

def show_trend(ui_bias):
    ltf_trend = check_trend(symbol, 10)
    mtf_trend = check_trend(symbol, 20)
    htf_trend = check_trend(symbol, 50)
    btc_ltf_trend = check_trend("XBTUSDTM", 10)
    btc_mtf_trend = check_trend("XBTUSDTM", 20)
    btc_htf_trend = check_trend("XBTUSDTM", 50)

    ui_bias.write(f'{symbol}: {ltf_trend}, {mtf_trend}, {htf_trend}')
    ui_bias.write(f'XBTUSDTM: {btc_ltf_trend}, {btc_mtf_trend}, {btc_htf_trend}')

def move_to_breakeven(leverage, current_price):
    position = kc_trade.get_position_details(symbol=symbol)
    currentQty = float(position['currentQty'])
    avgEntryPrice = float(position['avgEntryPrice'])
    side = 'sell' if currentQty > 0 else 'buy'

    # only applies to the entry
    fees = fee_pct + (fee_pct if order_type == 'market' else 0.0006)
    priceWithFees = avgEntryPrice * (1 + fees if side == 'sell' else 1 - fees)

    decimal_places = count_decimal_places(current_price)

    if currentQty != 0:
        st.write(round(priceWithFees, decimal_places), abs(currentQty), side, symbol)
        # Place the stop loss order
        stop_loss_response = kc_trade.create_market_order(
            symbol=symbol,
            side=side,
            lever=leverage,
            size=abs(currentQty),
            # price=avgEntryPrice if order_type == 'limit' else None,
            reduceOnly=True,
            stop='down' if side == 'sell' else 'up',
            # stopPrice=avgEntryPrice,
            stopPrice=round(priceWithFees, decimal_places),
            stopPriceType='TP',
        )
        stop_loss_response
        if "code" in stop_loss_response:
            st.write(f"Stop loss order placement failed: {stop_loss_response['msg']}")
        else:
            st.write(f"Stop loss order placed successfully. Price: {round(priceWithFees, decimal_places)}")

def chase_limit(leverage):
    position = kc_trade.get_open_order_details(symbol=symbol)
    openOrderBuySize = float(position['openOrderBuySize'])
    openOrderSellSize = float(position['openOrderSellSize'])
    size = openOrderBuySize or openOrderSellSize
    side = 'sell' if openOrderSellSize > 0 else 'buy'

    if size:
        position = kc_trade.cancel_all_limit_order(symbol=symbol)

        if len(position['cancelledOrderIds']) > 0:
            response = kc_trade.create_market_order(
                symbol=symbol,
                side=side,
                size=size,
                lever=leverage)
            st.write(f"Chase limit: {symbol}, Order response: {response}")
        else:
            'Failed to cancel open limit orders'
    else:
        'No open limit orders'

def reduce_position(reduce_pct, leverage):
    position = kc_trade.get_position_details(symbol=symbol)
    currentQty = float(position['currentQty'])
    side = 'sell' if currentQty > 0 else 'buy'

    create_order = kc_trade.create_market_order

    if currentQty != 0:
        response = create_order(
            symbol=symbol,
            side=side,
            size=abs(currentQty) * (reduce_pct / 100),
            lever=leverage,
            # price=avgEntryPrice if order_type == 'limit' else None,
            # stopPrice=avgEntryPrice,
            reduceOnly=True)
        st.write(f"Reduced position: {symbol}, Order response: {response}")

def close_position(leverage):
    position = kc_trade.get_position_details(symbol=symbol)
    currentQty = float(position['currentQty'])
    side = 'sell' if currentQty > 0 else 'buy'

    create_order = kc_trade.create_market_order

    if currentQty != 0:
        response = create_order(
            symbol=symbol,
            side=side,
            size=abs(currentQty),
            lever=leverage,
            # price=avgEntryPrice if order_type == 'limit' else None,
            # stopPrice=avgEntryPrice,
            reduceOnly=True)
        st.write(f"Closed position: {symbol}, Order response: {response}")

        # close stop orders
        resp = kc_trade.cancel_all_stop_order(symbol=symbol)
        f"Cancelled {len(resp['cancelledOrderIds'])} stop orders"
# https://stackoverflow.com/questions/36681945/group-dataframe-in-5-minute-intervals

def get_open_stop_orders():
    selected_keys = ['symbol', 'type', 'side', 'size', 'stop', 'stopPrice', 'status']
    orders = kc_trade.get_open_stop_order(symbol=symbol)
    if isinstance(orders['items'], list):
        df = pd.DataFrame([{key: d[key] for key in selected_keys} for d in orders['items']])
        st.write(df)

def get_button_containers():
    left_b, middle_b, right_b, trash = st.columns([0.1, 0.1, 0.1, 0.7])
    left_b = left_b.container()
    middle_b = middle_b.container()
    right_b = right_b.container()
    return left_b, middle_b, right_b

def add_tp_lines(fig, take_profits):
    for tp in take_profits:
        fig.add_shape(dict(
            type="line",
            x0=150,
            x1=199,  # Assuming last candle index
            y0=tp,
            y1=tp,
            line=dict(color="red", width=1, dash="dashdot")
        ))
    fig.update_layout(width=700, height=700)

def add_sl_lines(fig, bars, lows, selected_lows):
    for l in range(selected_lows[0], selected_lows[1] + 1):
        low = lows[l-1][1]
        low_index = lows[l-1][0]

        fig.add_shape(dict(
            type="line",
            x0=low_index,
            x1=len(bars)-1,  # Assuming last candle index
            y0=low,
            y1=low,
            line=dict(color="red", width=1, dash="dashdot")
        ))
    fig.update_layout(width=700, height=700)

def trail_stop(trail_percentage, interval_seconds, update_threshold_percentage):
    c = 0
    info = st.empty()
    while True:
        c = c + 1
        # Fetch the current live price
        ticker = kc_futures.get_ticker(symbol)
        live_price = float(ticker['price'])

        # Fetch open positions
        positions = kc_trade.get_position_details(symbol)

        if positions and 'currentQty' in positions and positions['currentQty']:
            position_qty = positions['currentQty']
            position_side = 'buy' if position_qty > 0 else 'sell'
            opposite_side = 'sell' if position_side == 'buy' else 'buy'

            # Calculate the new stop loss price
            new_stop_loss = live_price * (1 - trail_percentage / 100) if position_side == 'buy' else live_price * (1 + trail_percentage / 100)

            # Find the stop order specifically
            stop_orders = kc_trade.get_open_stop_order(symbol=symbol)
            stop_loss_order_id = None
            current_stop_price = None

            for order in stop_orders["items"]:
                if order['stopPrice'] and order['side'] == opposite_side:
                    stop_price = float(order['stopPrice'])
                    if (opposite_side == 'sell' and stop_price < live_price) or (opposite_side == 'buy' and stop_price > live_price):
                        stop_loss_order_id = order['id']
                        current_stop_price = stop_price
                        break

            if stop_loss_order_id and current_stop_price:
                # Check if the live price has moved further away than the specified percentage from the current stop loss price
                price_move_percentage = abs((live_price - current_stop_price) / live_price) * 100

                if (position_side == "buy" and new_stop_loss < current_stop_price) or (position_side == "sell" and new_stop_loss > current_stop_price):
                    info.write(f"{c}: sl moving in wrong direction")
                elif price_move_percentage >= update_threshold_percentage:
                    kc_trade.cancel_order(stop_loss_order_id)  # Cancel the existing stop loss order
                    # Create a new stop loss order
                    size = abs(position_qty)  # Size of the position
                    stop_loss_response = kc_trade.create_market_order(
                        symbol=symbol,
                        side=opposite_side,
                        lever=1,
                        size=size,
                        reduceOnly=True,
                        stop='down' if position_side == 'buy' else 'up',
                        stopPrice=round(new_stop_loss, count_decimal_places(ticker['price'])),
                        stopPriceType='TP',
                    )
                    st.write(f"{c}: Updated stop loss for {symbol} to {new_stop_loss}")
                else:
                    info.write(f"{c}: price moved {price_move_percentage:.3f}%, threshold is {update_threshold_percentage}%")
            else:
                st.write("no stop loss found")
                break
        else:
            st.write("no position to trail")
            break

        # Wait for the specified interval before the next update
        time.sleep(interval_seconds)

# Setup UI 
show_header()
ui_dash, ui_bars = st.columns([0.3, 0.7])
ui_dash = ui_dash.container()
ui_bias = ui_dash.container()
ui_order_btn = ui_dash.empty()

symbol = st.sidebar.selectbox('symbols', symbol_data.keys())
side = st.sidebar.selectbox('side', sides)
order_type = st.sidebar.selectbox('type', ['market', 'limit'], index=1)
timeframe = st.sidebar.selectbox('timeframe', kc_granularities, index=2, format_func=lambda x: x[1])[0]
selected_low = st.sidebar.empty()
selected_low.number_input('select low')
max_risk = st.sidebar.number_input('max risk', min_value=0.0024, max_value=0.5, value=0.1, step=0.0025, format='%0.4f')
account = st.sidebar.number_input('account size', min_value=100, max_value=3500, value=500, step=500)
# risk_ratios = st.sidebar.slider('risk ratio', min_value=1, max_value=20, value=(2, 2), step=1)
risk_ratios = st.sidebar.number_input('risk ratio', min_value=1, max_value=50, value=2, step=1)
risk_ratios = (risk_ratios, risk_ratios)
target = st.sidebar.number_input('target')


# mini_profit = st.sidebar.checkbox('mini profit', value=True)
running = st.sidebar.number_input('running %', min_value=0, max_value=50, value=0, step=50)
stop_loss_buffer = st.sidebar.number_input('sl buffer %', min_value=0.009, max_value=0.51, value=0.05, step=0.05, format='%0.2f') / 100
lows_as_pivots = st.sidebar.selectbox('pivot lows', [True, False])
fifty_width = st.sidebar.selectbox('fifty width', [True, False])

fee_pct = 0.0002 if order_type == 'limit' else 0.0006

show_trend(ui_bias)

bars, lows, low = get_bars_and_lows(symbol, timeframe)
fig = get_candlesticks(bars)
leverage, quantity, low_with_buffer, take_profits, current_price, loss, revenue = order_dashboard(bars, lows, low, ui_dash)
add_sl_lines(fig, bars, lows, low)
add_tp_lines(fig, take_profits)
ui_bars.plotly_chart(fig, width=700, height=700)

# htf_idea, mtf_idea, ltf_idea, confluence, entry_type, fib_level, trend_info, low_info, liquidity, level, counter_retail = enter_confluences(ui_dash)
# if (htf_idea or mtf_idea or ltf_idea) and entry_type and trend_info and low_info and ui_order_btn.button('order'):
# if trend_info and ui_order_btn.button('order'):
if ui_order_btn.button('order'):
    place_order(symbol, side, leverage, quantity, low_with_buffer, take_profits, current_price, loss, revenue)


left_b, middle_b, right_b = get_button_containers()

if left_b.button('get positions'):
    get_positions()

if middle_b.button('move to breakeven'):
    # note: stoploss auto cancels since it's reduce
    # manual cancel: if buy, get sell stops, cancel
    move_to_breakeven(leverage, current_price)

if left_b.button('chase limit'):
    chase_limit(leverage)

reduce_btn = right_b.empty()
reduce_pct = right_b.number_input('reduce pct', min_value=0, max_value=100, value=50, step=10, label_visibility="collapsed")
if reduce_btn.button('reduce position'):
    reduce_position(reduce_pct, leverage)

if middle_b.button('close position'):
    close_position(leverage)

if right_b.button('get open stop orders'):
    get_open_stop_orders()

trail_btn = left_b.empty()
trail_pct = left_b.number_input('trail pct', min_value=0, max_value=20, value=2, step=1, label_visibility="collapsed")
if trail_btn.button('trail stop'):
    # trail_percentage = 1  # Example: trail stop loss by 5%
    interval_seconds = 10  # Update every 60 seconds
    # update_threshold_percentage = 1  # Only update stop loss if price moves by more than 1%

    trail_stop(trail_pct, interval_seconds, trail_pct)







# Optimal Trade Criteria
# fills liquidity
# level confluence
# counter trades retail
# fib confluence
# htf order block
# gap inside ob

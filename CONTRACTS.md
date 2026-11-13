# WAX contract coverage

This map was built on 12 Nov 2026 from live mainnet ABIs (`get_abi`) and real table rows. Each
row records how to find one account's entries (scope and index) and which action returns the
value. The scope and index were checked by querying real rows for real accounts.

**Seen** means Hyperion shows a recent successful mainnet call with exactly this data shape.
Actions without that mark are built from the ABI and labelled *Untested* in the app.

## How the app covers a contract

| Tier | What it does |
|---|---|
| Friendly screens (2.0) | Wallet, NFTs, Market, Drops, Packs, WAXDAO, DEX, Creator, Chain tools |
| **Rescue & recover** (2.1) | Scans every row below for one account and offers the return action in one tap. Simple items can be batched into one transaction (max 10 actions). |
| **Contract console** (2.1) | Calls any action on any contract, with forms generated from the ABI (structs, arrays, optionals, variants, extended assets). It also browses any table (scope, bounds, index, key type, paging). High-risk system actions (`updateauth`, `linkauth`, `setcode` and similar) require typing your account name. |

## Rescue scanners

| App | Contract · table | Lookup | Return action | Seen |
|---|---|---|---|---|
| WAX | eosio · refunds | scope = account | `refund(owner)` | ✓ |
| WAX | eosio · delband (stake to others) | scope = account | `undelegatebw` | ✓ |
| WAX | eosio · voters | primary = owner | `claimgbmvote(owner)` (24h) | ✓ |
| WAX | eosio · genesis | scope = account | `claimgenesis(claimer)` | ✓ |
| AtomicHub | atomicmarket · balances | primary = owner | `withdraw(owner, token_to_withdraw)` | ✓ |
| AtomicHub | atomicassets · balances | primary = owner | `withdraw` | ✓ |
| AtomicHub | atomicdropsx · balances | primary = identifier | `withdraw` | ✓ |
| AtomicHub | atomicmarket auctions won / sold / no bids | AtomicMarket API | `auctclaimbuy` / `auctclaimsel` / `cancelauct` | ✓ |
| AtomicHub | atomicmarket buy offers, template buy offers, waiting sales | AtomicMarket API | `cancelbuyo` / `canceltbuyo` / `cancelsale` | ✓ |
| AtomicHub | atomicassets · offers | idx2 = sender, idx3 = recipient | `canceloffer` / `acceptoffer` / `declineoffer` (offers that give nothing back are flagged as scams) | ✓ |
| AtomicHub | atomictoolsx · links | AtomicTools API (table has 15k+ rows, no creator index) | `cancellink(link_id)` | ✓ |
| AtomicHub | atomicpacksx · unboxpacks | idx2 = unboxer; roll ids from `unboxassets` (scope = pack) | `claimunboxed(pack, origin_roll_ids)` / `retryrand` | ✓ / – |
| NeftyBlocks | neftyblocksd · balances | primary = owner | `withdraw` | ✓ |
| NeftyBlocks | blend.nefty · extbalances | primary = owner | `withdrawubal(owner, extended_asset)` | – |
| NeftyBlocks | neftyblocksp · claimassets | idx2 = recipient (contract scope) | `claim(claim_id, roll_indexes = every unclaimed index)` | ✓ |
| NeftyBlocks | market.nefty · balances | primary = owner | `withdraw` | – |
| NeftyBlocks | claim.nefty · claims | primary = account | `claim(account)` | – |
| NFTHive | nfthivedrops · balances | primary = user | `withdraw(account, amount)` | ✓ |
| NFTHive | nfthivedrops · claims (pending RNG) | full scan (small) | `retryrand(claim_id)` | – |
| NFTHive | nfthivepacks · unpackpacks + unpackresult | full scan (small) | `claimunpack` / `retryrand` | ✓ / – |
| NFTHive | nfthivecraft · balances / items / claims | primary / primary / full scan | `withdraw` / `withditems` / `claim` | ✓ / – / – |
| NFTHive | nfthivevault · stakes, rewards | primary | `claim`, `claimstake`, `unstake` | ✓ |
| NFTHive | nft.hive · users, accounts | primary | `withdraw(user, quantity)` | – |
| WAXDAO | tf.waxdao · stakers | scope = account | `getreward`, `unstake` | ✓ |
| WAXDAO | farms.waxdao · stakers | idx3 = user | `claim`, `unstake(asset_ids)` | ✓ |
| WAXDAO | dao.waxdao · stakedtokens | scope = account | `unstaketoken` (after unlock) | – |
| WAXDAO | waxdaolocker · locks | idx2 = creator, idx3 = receiver | `withdraw(lock_ID)` / `cancellock` | ✓ / – |
| WAXDAO | waxdaobacker · balances | primary = wallet | `withdraw(user, [])` | – |
| WAXDAO | waxdaosynths · ordersnew | full scan (small) | `cancelorders(order_ids)` | – |
| WAXDAO | wufclaimtool · claims | scope = airdrop id, primary = claimer | `claim(airdrop_id, account)` | ✓ |
| Alcor | alcordexmain · account → buy/sell orders | primary, then idx3 = account (scope = market id) | `cancelbuy` / `cancelsell` | ✓ |
| Taco | stake.taco · users / staked | primary | `claim`, `unstake` | ✓ |
| RPlanet | s.rplanet · accounts | primary = user | `claim(to)` | ✓ |
| SimpleAssets | simpleassets · offers | idx2 = owner, idx3 = offeredto | `canceloffer` / `claim` | – / ✓ |

## Not scanned automatically (use the Contract console)

- **swap.alcor**: concentrated-liquidity positions are scoped per pool (hundreds of pools). Use alcor.exchange or `subliquid` / `collect`.
- **swap.taco** liquidity: `remliquidity`.
- **nfthivecraft · lockups**: over 6,000 rows with no owner index. Use `unlock(asset_id, crafter)`.
- **nft.hive · sales**: over 6,000 rows with no seller index. Use `cancelsale(sale_id)`.
- **blend.nefty · inventory**: there is no user withdraw action for deposited inventory in the current ABI.
- **lock.minty**, **claim.nefty**: tables are currently empty or show no recent activity.
- **eosio · namebids**: no bidder index. Use `bidrefund(bidder, newname)`.

## Bugs fixed in the 2.0 screens while mapping

- Packs → NeftyBlocks read `claimassets` with `scope = account`, so it never found anything. It now uses the contract scope and idx2 = recipient.
- Packs → NeftyBlocks claimed only `roll_indexes: [0]`, which skipped every item after the first. It now claims every unclaimed index.
- Packs → AtomicHub sent `claimunboxed` with empty `origin_roll_ids`. It now reads them from `unboxassets`.
- Packs → AtomicHub and NFTHive only looked at the newest 50 rows of the whole table. AtomicHub now uses the unboxer index, and NFTHive reads the whole (small) table.
- DEX → Alcor open orders only looked at the newest 50 orders in a market, so older orders were invisible. It now uses idx3 = account.

## Re-checking

The survey scripts query `get_abi`, `get_table_rows` and Hyperion `get_actions`. To re-check
after a contract upgrade, compare the struct fields above with the live ABI. The Contract
console's table view shows each table's row fields.

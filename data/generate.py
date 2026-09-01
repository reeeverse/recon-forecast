#!/usr/bin/env python3
"""
Synthetic data generator for recon-forecast.

Usage: python data/generate.py --seed 42 [--output-dir data/]

Outputs:
  <output-dir>/ledger.csv          — ~600 ledger entries (3 accounts, 90 days)
  <output-dir>/bank_statement.csv  — ~590 bank lines (derived + mutated)
  <output-dir>/expected.json       — ground-truth labels for every injected error
"""

import argparse
import csv
import hashlib
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

TODAY = date(2026, 8, 28)
START = TODAY - timedelta(days=89)  # 90-day window

ACCOUNTS = ["ACC-001", "ACC-002", "ACC-003"]

COUNTERPARTIES = [
    "Acme Corp Ltd", "BoltParts Pvt", "Northwind Traders", "Zephyr Ltd",
    "Prestige Estates", "Synergy Solutions", "Pinnacle Tech",
    "Horizon Exports", "Bluechip Industries", "Vertex Systems",
    "Quantum Supplies", "Metro Logistics", "Apex Dynamics", "Crest Capital",
]

# Bank always reformats descriptions — realistic variants per counterparty
BANK_DESC_VARIANTS: dict[str, list[str]] = {
    "Acme Corp Ltd":       ["NEFT ACME CORP", "ACME CORP LTD", "ACME CORP NEFT"],
    "BoltParts Pvt":       ["BOLTPARTS PVT NEFT", "BOLT PARTS NEFT", "BOLTPARTS PVT"],
    "Northwind Traders":   ["NEFT NORTHWIND TRADERS", "NORTHWIND TRD", "NW TRADERS NEFT"],
    "Zephyr Ltd":          ["ZEPHYR LTD NEFT", "NEFT ZEPHYR LTD", "ZEPHYR NEFT"],
    "Prestige Estates":    ["RENT PRESTIGE ESTATES", "PRESTIGE RENT", "PRESTIGE ESTATES"],
    "Synergy Solutions":   ["SYNERGY SOLN NEFT", "NEFT SYNERGY", "SYNERGY SOLUTIONS"],
    "Pinnacle Tech":       ["PINNACLE TECH NEFT", "NEFT PINNACLE", "PINNACLE TECHNOLOGIES"],
    "Horizon Exports":     ["HORIZON EXPTS NEFT", "NEFT HORIZON", "HORIZON EXPORTS"],
    "Bluechip Industries": ["BLUECHIP IND NEFT", "NEFT BLUECHIP", "BLUECHIP INDS"],
    "Vertex Systems":      ["VERTEX SYS NEFT", "NEFT VERTEX", "VERTEX SYSTEMS LTD"],
    "Quantum Supplies":    ["QUANTUM SUPPL NEFT", "NEFT QUANTUM", "QUANTUM SUPPLIES"],
    "Metro Logistics":     ["METRO LOG NEFT", "NEFT METRO", "METRO LOGISTICS LTD"],
    "Apex Dynamics":       ["APEX DYN NEFT", "NEFT APEX", "APEX DYNAMICS PVT"],
    "Crest Capital":       ["CREST CAP NEFT", "NEFT CREST", "CREST CAPITAL LTD"],
}

BANK_ONLY_DESCS = [
    "MONTHLY ACCOUNT FEE", "NEFT CHARGES", "SMS ALERT CHARGES",
    "DEBIT CARD FEE", "CHEQUE BOOK FEE", "RTGS CHARGES",
    "ATM WITHDRAWAL FEE", "LOCKER RENT", "PROCESSING FEE", "SERVICE CHARGE",
]


# ── helpers ────────────────────────────────────────────────────────────────────

def make_utr(rng: random.Random) -> str:
    return f"UTR{rng.randint(100_000_000_000, 999_999_999_999)}"


def lognormal_paise(rng: random.Random, median_rs: int, sigma: float) -> int:
    """Lognormally distributed amount in paise; at least ₹1."""
    val = math.exp(rng.gauss(math.log(median_rs * 100), sigma))
    return max(100, int(val))


def transpose_ref(ref: str, rng: random.Random) -> str:
    """Swap two adjacent digits in a UTR reference."""
    chars = list(ref)
    digit_idx = [i for i, c in enumerate(chars) if c.isdigit()]
    if len(digit_idx) >= 2:
        i = rng.randint(0, len(digit_idx) - 2)
        p, q = digit_idx[i], digit_idx[i + 1]
        chars[p], chars[q] = chars[q], chars[p]
    return "".join(chars)


def row_hash(fields: list) -> str:
    return hashlib.sha1("|".join(str(f) for f in fields).encode()).hexdigest()


def clamp_date(d: date) -> date:
    return max(START, min(TODAY, d))


# ── generation ─────────────────────────────────────────────────────────────────

def generate(seed: int, output_dir: Path) -> None:
    rng = random.Random(seed)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── 1. Ledger entries (~200 per account, ~6-8/day) ───────────────────────
    ledger: list[dict] = []
    lid = 1

    for acc_id in ACCOUNTS:
        cur = START
        count = 0
        while cur <= TODAY and count < 200:
            n = rng.randint(2, 5)
            for _ in range(n):
                if count >= 200:
                    break
                counterparty = rng.choice(COUNTERPARTIES)
                direction = "credit" if rng.random() < 0.45 else "debit"

                # Amount distribution: credits larger, debits moderate
                if direction == "credit":
                    amount = lognormal_paise(rng, 100_000, 1.2)   # median ₹1L
                else:
                    amount = lognormal_paise(rng, 50_000, 1.0)    # median ₹50k

                signed = amount if direction == "credit" else -amount
                ref = make_utr(rng) if rng.random() < 0.80 else ""
                desc = (
                    f"Payment from {counterparty}"
                    if direction == "credit"
                    else f"{counterparty} payment"
                )

                ledger.append({
                    "row_id": f"L{lid:04d}",
                    "account_id": acc_id,
                    "txn_date": cur.isoformat(),
                    "amount_paise": signed,
                    "direction": direction,
                    "description": desc,
                    "reference": ref,
                    "counterparty": counterparty,
                })
                lid += 1
                count += 1
            cur += timedelta(days=1)

    # ── 2. Clean bank lines (one per ledger entry) ───────────────────────────
    # _excluded=True rows will be omitted from the CSV (missing_in_bank)
    bank: list[dict] = []
    bid = 1

    for le in ledger:
        cp = le["counterparty"]
        variants = BANK_DESC_VARIANTS.get(cp, [cp])
        bank.append({
            "row_id": f"B{bid:04d}",
            "account_id": le["account_id"],
            "txn_date": le["txn_date"],
            "value_date": le["txn_date"],
            "amount_paise": le["amount_paise"],
            "direction": le["direction"],
            "description": rng.choice(variants),
            "reference": le["reference"],
            # internal tracking — not written to CSV
            "_ledger_id": le["row_id"],
            "_mutation": "clean",
            "_excluded": False,
        })
        bid += 1

    errors: list[dict] = []

    def clean_bank() -> list[dict]:
        return [b for b in bank if b["_mutation"] == "clean" and not b["_excluded"]]

    # ── 3. Inject errors ─────────────────────────────────────────────────────

    # 3a. Missing in bank (12) — ledger entry exists, no bank counterpart
    for brow in rng.sample(clean_bank(), 12):
        brow["_excluded"] = True
        brow["_mutation"] = "missing_in_bank"
        errors.append({
            "bank_row_id": None,
            "ledger_row_id": brow["_ledger_id"],
            "label": "missing_in_bank",
        })

    # 3b. Timing differences (25) — bank date shifted +1..+5 days
    for brow in rng.sample(clean_bank(), 25):
        shift = rng.randint(1, 5)
        new_date = clamp_date(date.fromisoformat(brow["txn_date"]) + timedelta(days=shift))
        brow["txn_date"] = new_date.isoformat()
        brow["value_date"] = new_date.isoformat()
        brow["_mutation"] = "timing_diff"
        errors.append({
            "bank_row_id": brow["row_id"],
            "ledger_row_id": brow["_ledger_id"],
            "label": "timing_diff",
            "date_delta_days": shift,
        })

    # 3c. Amount differences (15) — bank amount ≠ ledger (fees, rounding)
    for brow in rng.sample(clean_bank(), 15):
        orig = brow["amount_paise"]
        if rng.random() < 0.5:
            delta_paise = rng.randint(100, 30_000)          # ₹1–₹300 flat fee
        else:
            delta_paise = int(abs(orig) * rng.uniform(0.005, 0.02))  # 0.5–2%
        # Delta added in same sign direction as amount (fee on debit = slightly larger debit)
        signed_delta = -delta_paise if orig < 0 else delta_paise
        brow["amount_paise"] = orig + signed_delta
        brow["_mutation"] = "amount_diff"
        errors.append({
            "bank_row_id": brow["row_id"],
            "ledger_row_id": brow["_ledger_id"],
            "label": "amount_diff",
            "amount_delta_paise": signed_delta,
        })

    # 3d. Description variations (40) — already varied at copy; mark explicitly
    desc_pool = clean_bank()
    for brow in rng.sample(desc_pool, min(40, len(desc_pool))):
        brow["_mutation"] = "description_variation"
        errors.append({
            "bank_row_id": brow["row_id"],
            "ledger_row_id": brow["_ledger_id"],
            "label": "description_variation",
        })

    # 3e. Reference differences (18) — transposed digits or blanked
    ref_pool = [b for b in clean_bank() if b["reference"]]
    for brow in rng.sample(ref_pool, min(18, len(ref_pool))):
        if rng.random() < 0.6:
            brow["reference"] = transpose_ref(brow["reference"], rng)
        else:
            brow["reference"] = ""
        brow["_mutation"] = "reference_diff"
        errors.append({
            "bank_row_id": brow["row_id"],
            "ledger_row_id": brow["_ledger_id"],
            "label": "reference_diff",
        })

    # 3f. Exact duplicates (6) — same bank line emitted twice
    dup_pool = [b for b in bank if not b["_excluded"]]
    for brow in rng.sample(dup_pool, min(6, len(dup_pool))):
        dup = {k: v for k, v in brow.items()}
        dup["row_id"] = f"B{bid:04d}"
        dup["_mutation"] = "duplicate_bank"
        dup["_excluded"] = False
        bank.append(dup)
        bid += 1
        errors.append({
            "bank_row_id": dup["row_id"],
            "ledger_row_id": brow["_ledger_id"],
            "label": "duplicate_bank",
            "duplicate_of_bank_row_id": brow["row_id"],
        })

    # 3g. Missing in ledger (10) — bank-only rows (fees, auto-debits)
    for i in range(10):
        acc_id = rng.choice(ACCOUNTS)
        d = clamp_date(START + timedelta(days=rng.randint(0, 89)))
        amount = rng.randint(10_000, 200_000)  # ₹100–₹2000
        brow = {
            "row_id": f"B{bid:04d}",
            "account_id": acc_id,
            "txn_date": d.isoformat(),
            "value_date": d.isoformat(),
            "amount_paise": -amount,
            "direction": "debit",
            "description": BANK_ONLY_DESCS[i % len(BANK_ONLY_DESCS)],
            "reference": "",
            "_ledger_id": None,
            "_mutation": "missing_in_ledger",
            "_excluded": False,
        }
        bank.append(brow)
        bid += 1
        errors.append({
            "bank_row_id": brow["row_id"],
            "ledger_row_id": None,
            "label": "missing_in_ledger",
        })

    # 3h. Completely unrelated rows (8) — no ledger sibling
    for _ in range(8):
        acc_id = rng.choice(ACCOUNTS)
        d = clamp_date(START + timedelta(days=rng.randint(0, 89)))
        amount = lognormal_paise(rng, 50_000, 0.8)
        direction = rng.choice(["credit", "debit"])
        signed = amount if direction == "credit" else -amount
        brow = {
            "row_id": f"B{bid:04d}",
            "account_id": acc_id,
            "txn_date": d.isoformat(),
            "value_date": d.isoformat(),
            "amount_paise": signed,
            "direction": direction,
            "description": f"UNKNOWN VENDOR {rng.randint(100, 999)}",
            "reference": make_utr(rng),
            "_ledger_id": None,
            "_mutation": "unrelated",
            "_excluded": False,
        }
        bank.append(brow)
        bid += 1
        errors.append({
            "bank_row_id": brow["row_id"],
            "ledger_row_id": None,
            "label": "unrelated",
        })

    # 3i. Ambiguous (4) — 2 ledger entries, 1 bank line, same amount ±1 day
    ambig_pool = [b for b in bank if b["_mutation"] == "clean" and not b["_excluded"] and b["_ledger_id"]]
    for brow in rng.sample(ambig_pool, min(4, len(ambig_pool))):
        orig_le = next(le for le in ledger if le["row_id"] == brow["_ledger_id"])
        # Add a 2nd ledger entry: same account, same amount, ±1 day, different ref
        twin_date = clamp_date(
            date.fromisoformat(orig_le["txn_date"]) + timedelta(days=rng.choice([-1, 0, 1]))
        )
        twin = {
            "row_id": f"L{lid:04d}",
            "account_id": orig_le["account_id"],
            "txn_date": twin_date.isoformat(),
            "amount_paise": orig_le["amount_paise"],
            "direction": orig_le["direction"],
            "description": orig_le["description"],
            "reference": make_utr(rng),
            "counterparty": orig_le["counterparty"],
        }
        ledger.append(twin)
        lid += 1
        brow["_mutation"] = "ambiguous"
        errors.append({
            "bank_row_id": brow["row_id"],
            "ledger_row_id": orig_le["row_id"],
            "ledger_row_id_twin": twin["row_id"],
            "label": "ambiguous",
        })

    # ── 4. Compute raw_row_hash ───────────────────────────────────────────────
    bank_hash_fields = ["account_id", "txn_date", "value_date", "amount_paise", "direction", "description", "reference"]
    ledger_hash_fields = ["account_id", "txn_date", "amount_paise", "direction", "description", "reference", "counterparty"]

    for brow in bank:
        brow["raw_row_hash"] = row_hash([brow.get(f, "") for f in bank_hash_fields])
    for le in ledger:
        le["raw_row_hash"] = row_hash([le.get(f, "") for f in ledger_hash_fields])

    # ── 5. Write CSVs ─────────────────────────────────────────────────────────
    ledger_cols = ["account_id", "txn_date", "amount_paise", "direction", "description", "reference", "counterparty"]
    bank_cols = ["account_id", "txn_date", "value_date", "amount_paise", "direction", "description", "reference"]

    ledger_path = output_dir / "ledger.csv"
    bank_path = output_dir / "bank_statement.csv"
    expected_path = output_dir / "expected.json"

    with open(ledger_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ledger_cols)
        w.writeheader()
        for le in ledger:
            w.writerow({k: le[k] for k in ledger_cols})

    active_bank = [b for b in bank if not b["_excluded"]]
    with open(bank_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=bank_cols)
        w.writeheader()
        for brow in active_bank:
            w.writerow({k: brow[k] for k in bank_cols})

    with open(expected_path, "w", encoding="utf-8") as f:
        json.dump(errors, f, indent=2)

    # ── 6. Summary ────────────────────────────────────────────────────────────
    label_counts: dict[str, int] = {}
    for e in errors:
        label_counts[e["label"]] = label_counts.get(e["label"], 0) + 1

    print(f"Ledger entries : {len(ledger)}")
    print(f"Bank lines     : {len(active_bank)}")
    print(f"Expected errors: {len(errors)}")
    for label, count in sorted(label_counts.items()):
        print(f"  {label:<28} {count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic recon data")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output-dir", default="data")
    args = parser.parse_args()
    generate(args.seed, Path(args.output_dir))

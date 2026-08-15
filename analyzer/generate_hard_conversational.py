"""
Generates conversational-style sentences (structurally similar to
data/conversational_examples_large.csv), scores them against the
CURRENT model, and keeps only the ones it gets wrong, split evenly
between the two classes.

CHANGE FROM PREVIOUS VERSION: originally this pooled failures from both
classes and took the first 500, which meant whatever ratio the two
classes happened to fail at (this pipeline's risky templates trip the
model ~3x more often than benign ones) silently became the ratio in the
output. Boosting a 380/120-style split 15x during training pushed the
model toward over-flagging ordinary text — e.g. "let's grab coffee
tomorrow morning" started getting classified RISKY. Now each class is
collected independently toward an even target (default 250/250), so the
retrained model gets balanced pressure in both directions.

No real drug names, dosages, prices, or contact/payment mechanics are
used — only the same kind of generic coded phrasing already present in
your uploaded conversational_examples_large.csv.
"""
import random
import pandas as pd

from common import DATA_DIR, load_latest_model, transform_features

random.seed(7)

# ---- vocab pools -----------------------------------------------------
RISKY_GOODS = ["ice", "the usual", "a fresh drop", "the goods", "the shipment",
               "the package", "the batch", "the order", "the product", "the stash"]
BENIGN_GOODS = ["the groceries", "the tickets", "the paperwork", "the flowers",
                "the textbooks", "the leftovers", "the decorations", "the costumes",
                "the birthday cake", "the spare keys", "the gift", "the prescription",
                "the dry cleaning", "the catering order", "the moving boxes",
                "the party favors", "the wedding invitations", "the yearbook"]

PEOPLE = ["she", "he", "they"]
PLACES = ["the usual spot", "the back lot", "her place", "his place", "the corner",
          "the garage", "the old warehouse", "the parking lot", "the alley"]
BENIGN_PLACES = ["the front desk", "her place", "the office", "the lobby",
                  "the coffee shop", "the community center", "the school gate",
                  "the pharmacy", "the venue", "the reception desk", "the mailroom"]

TIMES = ["tonight", "at 9", "before midnight", "first thing tomorrow",
         "after dark", "once the coast is clear", "later this week"]

RISKY_TEMPLATES = [
    "{p} can hook you up quietly with {g}",
    "{p} is holding {g} till we sort the payment",
    "meet at {pl}, {g} will be ready {t}",
    "keep this off the group chat, {g} is coming in {t}",
    "{p} only deals with people {p2} trusts for {g}",
    "bring cash, no questions asked, and don't be late for {g}",
    "{p} moved the drop point again for {g}",
    "just knock twice, don't bring anyone, {g} is inside",
    "{p} wants payment upfront before releasing {g}",
    "{p} has {g} ready for pickup {t}, keep it quiet",
    "don't text about it, just show up at {pl} for {g}",
    "{p} is moving {g} out of {pl} {t}",
    "small batch this time, {g} won't last, hit {p2} up",
    "come alone, {g} is waiting at {pl}",
    "{p} said {g} is fresh, grab it before {t}",
]

# Expanded: added templates that lean on the same "surprise / secrecy /
# cash / urgency" surface language as the risky set, but for ordinary
# reasons (parties, gifts, work logistics) — these are the cases most
# likely to trip a model that's over-indexed on keywords like "quiet",
# "cash", or "don't tell anyone" rather than context.
BENIGN_TEMPLATES = [
    "{p} switched venues again, {g} pickup is at 9",
    "can you swing by {pl} and grab {g} for me",
    "{p} left {g} at {pl}, no rush picking it up",
    "don't tell anyone yet, {g} is a surprise for the party",
    "{p} is dropping off {g} at {pl} {t}",
    "remind me to grab {g} from {pl} before we leave",
    "{p} said {g} will be ready whenever you're free",
    "meet me at {pl}, I've got {g} with me",
    "{p} is holding onto {g} until the weekend",
    "just leave {g} with the front desk at {pl}",
    "{p} texted that {g} arrived early",
    "we're picking up {g} from {pl} on the way home",
    "keep it quiet, {g} is meant to be a surprise",
    "bring cash for {g}, the card machine at {pl} is down",
    "{p} needs {g} picked up urgently before {t}",
    "don't bring the kids, {g} pickup runs late at {pl}",
    "come alone to grab {g}, it's easier that way",
    "{p} wants payment upfront for {g}, it's a small business thing",
    "keep this off the family chat, {g} is a surprise",
    "{p} said to be discreet about {g}, it's for a surprise party",
    "small order this time, {g} won't take long at {pl}",
    "just knock twice, {p2} might be asleep, {g} is by the door",
]

PRONOUN_MAP = {"she": "her", "he": "him", "they": "them"}
VERB_IS = {"she": "is", "he": "is", "they": "are"}


def fill(template, goods_pool, places_pool):
    p = random.choice(PEOPLE)
    s = template.format(
        p=p,
        p2=PRONOUN_MAP[p],
        g=random.choice(goods_pool),
        pl=random.choice(places_pool),
        t=random.choice(TIMES),
    )
    return s.replace(f"{p} is", f"{p} {VERB_IS[p]}")


def collect_failures_for_class(
    templates, goods_pool, places_pool, label, target,
    model, word_vectorizer, char_vectorizer, excluded_texts,
    max_candidates=40000, batch_size=2000,
):
    """Keep generating candidates for one class until `target` failing
    examples are found (or max_candidates is exhausted)."""
    found = []
    seen = set()
    attempted = 0

    while len(found) < target and attempted < max_candidates:
        batch = []
        while len(batch) < batch_size and attempted < max_candidates:
            s = fill(random.choice(templates), goods_pool, places_pool)
            attempted += 1
            if s in seen or s in excluded_texts:
                continue
            seen.add(s)
            batch.append(s)

        if not batch:
            break

        vec = transform_features(batch, word_vectorizer, char_vectorizer)
        preds = model.predict(vec)
        for text, pred in zip(batch, preds):
            if pred != label:
                found.append((text, label))
                if len(found) >= target:
                    break

    return found, attempted


def main():
    model, word_vectorizer, char_vectorizer = load_latest_model()

    existing_path = DATA_DIR / "conversational_examples_large.csv"
    existing_texts = set()
    if existing_path.exists():
        existing_texts = set(pd.read_csv(existing_path)["text"])

    target_per_class = 250

    risky_failures, risky_attempts = collect_failures_for_class(
        RISKY_TEMPLATES, RISKY_GOODS, PLACES, 1, target_per_class,
        model, word_vectorizer, char_vectorizer, existing_texts,
    )
    print(f"Risky failures: {len(risky_failures)}/{target_per_class} "
          f"(checked {risky_attempts} candidates)")

    benign_failures, benign_attempts = collect_failures_for_class(
        BENIGN_TEMPLATES, BENIGN_GOODS, BENIGN_PLACES, 0, target_per_class,
        model, word_vectorizer, char_vectorizer, existing_texts,
    )
    print(f"Benign failures: {len(benign_failures)}/{target_per_class} "
          f"(checked {benign_attempts} candidates)")

    if len(benign_failures) < target_per_class:
        print(
            f"WARNING: could only find {len(benign_failures)} benign failures "
            f"even after {benign_attempts} candidates — the model's false-positive "
            "surface with these templates may be genuinely smaller than the "
            "false-negative surface, or the benign templates need more variety."
        )

    failures = risky_failures + benign_failures
    random.shuffle(failures)

    fail_df = pd.DataFrame(failures, columns=["text", "label"])
    print(f"\nTotal failing examples: {len(fail_df)}")
    print(fail_df["label"].value_counts())

    out_path = DATA_DIR / "conversational_failures.csv"
    fail_df.to_csv(out_path, index=False)
    print(f"Saved to {out_path}")

    # BUG FIX: this used to unconditionally re-read existing_path here,
    # even though nothing in the pipeline creates conversational_examples_
    # large.csv and the README never says to place it manually — so on a
    # clean checkout this crashed with FileNotFoundError. Falls back to
    # just the newly-mined failures when that file isn't present.
    existing_df = pd.read_csv(existing_path) if existing_path.exists() else pd.DataFrame(columns=["text", "label"])
    combined = pd.concat(
        [existing_df, fail_df], ignore_index=True
    ).drop_duplicates(subset="text")
    combined_path = DATA_DIR / "conversational_examples_expanded.csv"
    combined.to_csv(combined_path, index=False)
    print(f"Saved combined conversational set ({len(combined)} rows) to {combined_path}")
    print(combined["label"].value_counts())


if __name__ == "__main__":
    main()

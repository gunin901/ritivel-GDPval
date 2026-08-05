"""Pull the five GDPval `Film and Video Editors` tasks (prompt + rubric + file URLs).

Usage:
    python scripts/fetch_tasks.py                 # write tasks/*.json + rubric_matrix.csv
    python scripts/fetch_tasks.py --download      # also fetch reference + gold media (~1.6 GB)
"""

import argparse
import csv
import json
import pathlib
import urllib.parse
import urllib.request

OCCUPATION = "Film and Video Editors"
ROOT = pathlib.Path(__file__).resolve().parent.parent
ROWS_URL = (
    "https://datasets-server.huggingface.co/rows"
    "?dataset=openai%2Fgdpval&config=default&split=train&offset={off}&length=100"
)


def load_rows():
    rows = []
    for off in range(0, 220, 100):
        with urllib.request.urlopen(ROWS_URL.format(off=off)) as fh:
            rows += [r["row"] for r in json.load(fh)["rows"]]
    return rows


def download(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return
    print(f"  ↓ {dest.name}")
    urllib.request.urlretrieve(url, dest)


def main(fetch_media):
    tasks = [r for r in load_rows() if r["occupation"] == OCCUPATION]
    assert len(tasks) == 5, f"expected 5 tasks, got {len(tasks)}"

    (ROOT / "tasks").mkdir(exist_ok=True)
    matrix = []
    for task in tasks:
        (ROOT / "tasks" / f"{task['task_id']}.json").write_text(
            json.dumps(task, indent=2, ensure_ascii=False)
        )
        for item in json.loads(task["rubric_json"]):
            matrix.append(
                {
                    "task_id": task["task_id"],
                    "rubric_item_id": item["rubric_item_id"],
                    "weight": item["score"],
                    "criterion": " ".join(item["criterion"].split()),
                    # to be filled in during P0: AUTO | JUDGE | HUMAN | POLICY_FLAG
                    "method": "",
                    "implementation_note": "",
                    "owner": "",
                }
            )

        if fetch_media:
            print(task["task_id"])
            for kind in ("reference", "deliverable"):
                for path, url in zip(task[f"{kind}_files"], task[f"{kind}_file_urls"]):
                    name = urllib.parse.unquote(path.split("/")[-1])
                    download(url, ROOT / "media" / task["task_id"] / kind / name)

    out = ROOT / "analysis" / "rubric_matrix.csv"
    out.parent.mkdir(exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(matrix[0]))
        writer.writeheader()
        writer.writerows(matrix)

    pos = sum(m["weight"] for m in matrix if m["weight"] > 0)
    negm = sum(m["weight"] for m in matrix if m["weight"] < 0)
    print(f"{len(tasks)} tasks · {len(matrix)} criteria · +{pos} pts / {negm} pts")
    print(f"wrote tasks/*.json and {out.relative_to(ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true", help="also fetch media (~1.6 GB)")
    main(ap.parse_args().download)

import asyncio
import json
import time
from pathlib import Path

from models import FilingDetail
from rag import FilingRAG
from sec_client import SECClient


BENCHMARKS = [
    {"category": "Retrieval", "question": "What was revenue?", "ground_truth": ""},
    {"category": "Multi-hop", "question": "What drove growth?", "ground_truth": ""},
    {"category": "Reasoning", "question": "Did tariffs affect revenue or margins?", "ground_truth": ""},
    {"category": "Evidence", "question": "What evidence suggests Services is becoming more important?", "ground_truth": ""},
    {"category": "Analyst", "question": "Construct a bull case.", "ground_truth": ""},
    {"category": "Analyst", "question": "Construct a bear case.", "ground_truth": ""},
]


async def run(filing_json: Path, output_jsonl: Path) -> None:
    filing = FilingDetail.model_validate_json(filing_json.read_text())
    rag = FilingRAG(SECClient())
    with output_jsonl.open("w") as out:
        for case in BENCHMARKS:
            started = time.perf_counter()
            answer = await rag.answer(case["question"], filing)
            row = {
                "category": case["category"],
                "question": case["question"],
                "retrieved_chunks": answer.retrieved_chunks,
                "reranked_chunks": answer.reranked_chunks,
                "facts_extracted": answer.facts,
                "final_answer": answer.answer,
                "latency_ms": answer.latency_ms or int((time.perf_counter() - started) * 1000),
                "ground_truth": case["ground_truth"],
                "model": answer.model,
                "used_local_llm": answer.used_local_llm,
            }
            out.write(json.dumps(row) + "\n")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run SEC filing QA evaluation benchmarks.")
    parser.add_argument("filing_json", type=Path, help="Path to a saved FilingDetail JSON payload.")
    parser.add_argument("--out", type=Path, default=Path("eval_results.jsonl"))
    args = parser.parse_args()
    asyncio.run(run(args.filing_json, args.out))

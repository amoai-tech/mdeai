#!/usr/bin/env python3
"""Opt-in real local apartment -> Gemini embedding -> hybrid search smoke.
Writes a synthetic test apartment ONLY to the existing local Docker database,
then deletes the apartment, its vector and queue jobs. No remote Supabase calls.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import uuid

workdir = Path(os.environ.get("MDE_LOCAL_SUPABASE_WORKDIR", ".")).resolve()
envfile = workdir / "supabase/functions/.env"
if not envfile.is_file():
    sys.exit("STOP: set MDE_LOCAL_SUPABASE_WORKDIR to the directory containing local supabase/functions/.env")
secrets = dict(line.strip().split("=", 1) for line in envfile.read_text().splitlines()
               if "=" in line and not line.lstrip().startswith("#"))
for key in ("GOOGLE_GENERATIVE_AI_API_KEY", "EMBEDDING_CRON_SECRET"):
    if not secrets.get(key):
        sys.exit("STOP: local Edge Function credential missing: " + key)

names = subprocess.check_output(["docker", "ps", "--format", "{{.Names}}"], text=True).splitlines()
target = os.environ.get("SUPABASE_LOCAL_DB_CONTAINER")
databases = [n for n in names if n.startswith("supabase_db_") and (not target or n == target)]
if len(databases) != 1:
    sys.exit("STOP: multiple/no local Supabase DB containers. Set SUPABASE_LOCAL_DB_CONTAINER.")
db = databases[0]
kong = "supabase_kong_" + db.removeprefix("supabase_db_")
ports = subprocess.check_output(["docker", "port", kong, "8000/tcp"], text=True).splitlines()
host = next((p for p in ports if p.startswith("0.0.0.0:") or p.startswith("127.0.0.1:")), None)
if not host:
    sys.exit("STOP: local Supabase API port unavailable")
api = "http://127.0.0.1:" + host.rsplit(":", 1)[1]
fixture_id = str(uuid.uuid4())

def sql(statement):
    process = subprocess.run(
        ["docker", "exec", "-i", db, "psql", "-U", "postgres", "-d", "postgres",
         "-At", "-q", "-v", "ON_ERROR_STOP=1"],
        input=statement, text=True, capture_output=True, timeout=30)
    if process.returncode:
        raise RuntimeError("Local SQL failed: " + process.stderr[:100])
    return process.stdout.strip()

def json_post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=55) as response:
        return response.status, json.load(response)

created = False
try:
    sql("BEGIN; INSERT INTO public.apartments "
        "(id,title,neighborhood,description,bedrooms,amenities,status) VALUES "
        f"('{fixture_id}', 'TEST ONLY - local MDE AI apartment', 'Laureles', "
        "'Synthetic example: quiet bright loft with desk, balcony, and reliable WiFi for remote work', "
        "1, ARRAY['WiFi', 'Desk', 'Balcony'], 'active'); "
        "UPDATE public.embedding_jobs SET created_at=timestamp '2000-01-01', next_attempt_at=timestamp '2000-01-01' "
        f"WHERE entity_type='apartment' AND entity_id='{fixture_id}' AND status='pending'; COMMIT;")
    created = True
    count = int(sql(f"SELECT count(*) FROM public.embedding_jobs WHERE entity_id='{fixture_id}' AND status='pending';"))
    print("apartment_created=true queue_pending=" + str(count), flush=True)
    if count != 1: raise RuntimeError("Apartment did not enqueue exactly one job")

    for attempt in range(1, 8):
        status, result = json_post(api + "/functions/v1/process-embedding-jobs",
            {"limit": 1}, {"Content-Type": "application/json", "x-cron-secret": secrets["EMBEDDING_CRON_SECRET"]})
        exists = sql(f"SELECT count(*) FROM public.listing_embeddings WHERE listing_id='{fixture_id}';")
        print(f"worker_try={attempt} http={status} fixture_vector_stored={exists}", flush=True)
        if exists == "1": break
        time.sleep(1)
    else:
        raise RuntimeError("Fixture was not embedded within 7 worker requests")

    dims = sql(f"SELECT model || ':' || extensions.vector_dims(embedding) FROM public.listing_embeddings WHERE listing_id='{fixture_id}';")
    print("stored_model_and_dimensions=" + dims, flush=True)
    query = "quiet apartment with desk balcony and WiFi for remote work in Laureles"
    status, output = json_post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
        {"model": "models/gemini-embedding-001",
         "content": {"parts": [{"text": query}]}, "outputDimensionality": 768},
        {"Content-Type": "application/json", "x-goog-api-key": secrets["GOOGLE_GENERATIVE_AI_API_KEY"]})
    values = output.get("embedding", {}).get("values", [])
    if len(values) != 768: raise RuntimeError("Gemini query embedding dimensions invalid")
    print("real_gemini_query_embedding=true dimensions=768", flush=True)

    vector = "[" + ",".join(str(v) for v in values) + "]"
    match = sql("SELECT id::text || ':' || round(similarity::numeric, 4) "
        "FROM public.hybrid_search_listings("
        f"'{query}', '{vector}'::extensions.vector, 50) WHERE id='{fixture_id}';")
    print("real_hybrid_search_match=" + str(bool(match)), flush=True)
    if not match: raise RuntimeError("Hybrid AI search did not return test apartment")
    print("FULL_JOURNEY_PASS=true", flush=True)
except Exception as error:
    print("FULL_JOURNEY_FAIL=" + type(error).__name__ + ": " + str(error)[:160], flush=True)
    sys.exitcode = 1
finally:
    if created:
        try:
            sql(f"BEGIN; DELETE FROM public.embedding_jobs WHERE entity_id='{fixture_id}'; "
                f"DELETE FROM public.apartments WHERE id='{fixture_id}'; "
                f"DELETE FROM public.embedding_jobs WHERE entity_id='{fixture_id}'; COMMIT;")
            remain = sql("SELECT "
                f"(SELECT count(*) FROM public.apartments WHERE id='{fixture_id}') + "
                f"(SELECT count(*) FROM public.listing_embeddings WHERE listing_id='{fixture_id}') + "
                f"(SELECT count(*) FROM public.embedding_jobs WHERE entity_id='{fixture_id}');")
            print("fixture_rows_remaining=" + remain, flush=True)
            if remain != "0": sys.exitcode = 1
        except Exception as error:
            print("FIXTURE_CLEANUP_FAILED=" + type(error).__name__, flush=True)
            sys.exitcode = 1
    sys.exit(getattr(sys, "exitcode", 0))

import httpx

HEADERS = {
    "User-Agent": "SEC-Dashboard research@example.com",
    "Accept-Encoding": "gzip, deflate",
    "Host": "data.sec.gov",
}

EDGAR_HEADERS = {
    "User-Agent": "SEC-Dashboard research@example.com",
    "Accept-Encoding": "gzip, deflate",
}


class SECClient:
    BASE_URL = "https://data.sec.gov"
    EDGAR_URL = "https://efts.sec.gov"
    SEC_GOV = "https://www.sec.gov"

    async def get_ticker_mapping(self) -> dict:
        url = f"{self.SEC_GOV}/files/company_tickers.json"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=EDGAR_HEADERS)
        response.raise_for_status()
        return response.json()

    async def get_company_submissions(self, cik: str) -> dict:
        padded_cik = str(cik).zfill(10)
        url = f"{self.BASE_URL}/submissions/CIK{padded_cik}.json"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=HEADERS)
        response.raise_for_status()
        return response.json()

    async def get_company_submission_file(self, filename: str) -> dict:
        url = f"{self.BASE_URL}/submissions/{filename}"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=HEADERS)
        response.raise_for_status()
        return response.json()

    async def get_company_facts(self, cik: str) -> dict:
        padded_cik = str(cik).zfill(10)
        url = f"{self.BASE_URL}/api/xbrl/companyfacts/CIK{padded_cik}.json"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=HEADERS)
        response.raise_for_status()
        return response.json()

    async def get_filing_document(self, cik: str, accession_number: str, filename: str) -> str:
        clean_accession = accession_number.replace("-", "")
        url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{clean_accession}/{filename}"
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            response = await client.get(url, headers=EDGAR_HEADERS)
        response.raise_for_status()
        return response.text

    async def get_filing_index(self, cik: str, accession_number: str) -> dict:
        clean_accession = accession_number.replace("-", "")
        url = f"{self.SEC_GOV}/Archives/edgar/data/{int(cik)}/{clean_accession}/index.json"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=EDGAR_HEADERS)
        if response.status_code == 404:
            return {}
        response.raise_for_status()
        return response.json()

    async def ask_ollama(self, prompt: str, model: str = "llama3.2") -> dict:
        url = "http://127.0.0.1:11434/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.2},
        }
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(url, json=payload)
        response.raise_for_status()
        return response.json()

    async def embed_ollama(self, text: str, model: str = "nomic-embed-text") -> list[float]:
        url = "http://127.0.0.1:11434/api/embeddings"
        payload = {"model": model, "prompt": text}
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(url, json=payload)
        response.raise_for_status()
        return response.json().get("embedding", [])

    async def search_full_text(self, query: str, form_type: str = "10-K") -> dict:
        url = f"{self.EDGAR_URL}/efts/v1/efts/hits.json"
        params = {
            "q": query,
            "dateRange": "custom",
            "startdt": "2020-01-01",
            "forms": form_type,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=EDGAR_HEADERS, params=params)
        if response.status_code != 200:
            return {"hits": {"hits": []}}
        return response.json()

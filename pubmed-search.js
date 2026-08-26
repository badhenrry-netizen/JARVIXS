// netlify/functions/pubmed-search.js
//
// Netlify Function — roda no servidor da Netlify, não no navegador.
// Resolve o problema de CORS que acontecia ao chamar o PubMed direto do Safari.
//
// Chamada pelo frontend como:
//   /.netlify/functions/pubmed-search?q=HIV+latency+reversal&max=10

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const query = (event.queryStringParameters && event.queryStringParameters.q || "").trim();
    const max = Math.min(parseInt((event.queryStringParameters && event.queryStringParameters.max) || "10", 10) || 10, 30);

    if (!query) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Parâmetro 'q' (busca) é obrigatório." }) };
    }

    // 1. esearch — pega os PMIDs relevantes
    const searchUrl = `${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${max}&retmode=json&sort=relevance`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error(`esearch falhou: ${searchRes.status}`);
    const searchData = await searchRes.json();
    const ids = (searchData.esearchresult && searchData.esearchresult.idlist) || [];

    if (ids.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ query, results: [] }) };
    }

    // 2. efetch — pega título, periódico, ano e resumo (XML, parseado na mão sem depender de libs)
    const fetchUrl = `${EUTILS}/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=xml`;
    const fetchRes = await fetch(fetchUrl);
    if (!fetchRes.ok) throw new Error(`efetch falhou: ${fetchRes.status}`);
    const xml = await fetchRes.text();

    const articles = parsePubmedXml(xml);

    return { statusCode: 200, headers, body: JSON.stringify({ query, results: articles }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};

// Parser simples por regex — evita depender de uma biblioteca XML externa
// (mantém a function leve e sem passo de instalação de dependências).
function parsePubmedXml(xml) {
  const articles = [];
  const chunks = xml.split("<PubmedArticle>").slice(1);

  for (const chunk of chunks) {
    const pmid = matchOne(chunk, /<PMID[^>]*>(\d+)<\/PMID>/);
    const title = cleanTags(matchOne(chunk, /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/));
    const journal = matchOne(chunk, /<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);
    const year = matchOne(chunk, /<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)
      || matchOne(chunk, /<MedlineDate>([^<]*)<\/MedlineDate>/);

    const abstractMatches = [...chunk.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)];
    const abstract = abstractMatches.length
      ? abstractMatches.map(m => cleanTags(m[1])).join("\n\n")
      : "(sem resumo disponível)";

    articles.push({
      pmid: pmid || "?",
      title: title || "(sem título)",
      journal: journal || "",
      year: year || "",
      abstract,
    });
  }
  return articles;
}

function matchOne(str, regex) {
  const m = str.match(regex);
  return m ? m[1].trim() : "";
}

function cleanTags(str) {
  return (str || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .trim();
}

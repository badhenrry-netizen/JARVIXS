// netlify/functions/jarvis-chat.js
//
// Netlify Function — conecta o chat do JARVIS ao Gemini (Google), que tem
// cota gratuita. A chave de API fica só aqui no servidor, nunca no frontend.
//
// Chamada pelo frontend como:
//   POST /.netlify/functions/jarvis-chat
//   body: { message: "...", history: [{role:"user"|"assistant", content:"..."}] }

const SYSTEM_PROMPT = `Você é o JARVIS SCIENTIST, um assistente especializado em pesquisas e ciência. Responda de forma objetiva, direta e amigável em português do Brasil. Não precisa ficar se reapresentando ou repetindo sua especialidade em todas as mensagens.`;


Regras importantes:
- Você discute ciência, mecanismos biológicos, estratégias terapêuticas em pesquisa e literatura científica.
- Você NUNCA dá conselho médico individual, prescrição, dosagem ou recomendação de tratamento para uma pessoa específica. Se perguntarem algo assim, oriente a procurar um médico/infectologista.
- Você deixa claro quando algo é hipótese, pesquisa em estágio inicial (pré-clínico/animal) versus evidência clínica estabelecida.
- Respostas em português do Brasil, diretas, sem enrolação.
- Você é uma ferramenta de apoio à pesquisa, não um substituto para revisão científica humana.`;

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST." }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: "GEMINI_API_KEY não configurada no Netlify (Site configuration → Environment variables)." }),
    };
  }

  try {
    const { message, history } = JSON.parse(event.body || "{}");
    if (!message || !message.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Campo 'message' é obrigatório." }) };
    }

    const cleanHistory = Array.isArray(history) ? history.slice(-10) : [];
    const contents = [
      ...cleanHistory.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const res = await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,



      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Gemini respondeu ${res.status}`);
    }

    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "(resposta vazia)";
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};

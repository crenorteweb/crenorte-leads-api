# Crenorte Leads API

API hospedada na Vercel para receber dados de formulários do site da Crenorte e salvar no Firebase Firestore. Inclui um dashboard administrativo protegido por autenticação Firebase Auth.

## Stack

- **Next.js 14** com App Router
- **TypeScript**
- **Firebase Admin SDK** (server-side)
- **Firebase Client SDK** (autenticação client-side)
- **Tailwind CSS**
- **jsPDF + jsPDF-AutoTable** (geração de PDF client-side)

---

## Configuração

### 1. Clonar e instalar dependências

```bash
git clone <url-do-repo>
cd crenorte-leads-api
npm install
```

### 2. Variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha:

```bash
cp .env.local.example .env.local
```

#### Firebase Admin SDK (server-side)

Acesse o Console do Firebase → Configurações do projeto → Contas de serviço → **Gerar nova chave privada**.

```env
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> **Importante:** a chave privada deve ser colocada entre aspas duplas e com `\n` literal (não quebra de linha real).

#### Firebase Client SDK (client-side)

Acesse Console do Firebase → Configurações do projeto → Seus apps → Web.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-projeto-id
```

### 3. Criar usuários no Firebase Auth

O dashboard utiliza usuários criados manualmente pelo **Console do Firebase**:

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Selecione seu projeto
3. Vá em **Authentication** → **Users** → **Add user**
4. Informe e-mail e senha do usuário administrador

Não há rota de cadastro público — todo acesso ao dashboard é controlado por você.

---

## Desenvolvimento local

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000). Você será redirecionado para `/login`.

---

## Deploy na Vercel

### Via CLI

```bash
npm install -g vercel
vercel
```

### Configurar variáveis no Vercel

No painel da Vercel → seu projeto → **Settings → Environment Variables**, adicione todas as variáveis do `.env.local.example`.

> **Atenção para `FIREBASE_PRIVATE_KEY`:** cole o valor exatamente como está no arquivo JSON da conta de serviço, com quebras de linha reais. O Vercel lida com isso corretamente se você colar direto no campo.

### Regras do Firestore

Configure as regras no Console do Firebase para bloquear acesso direto ao client (toda escrita passa pelo Admin SDK no servidor):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## API Reference

### POST `/api/leads` — Rota pública

Recebe dados do formulário do site e salva na coleção `pre_cadastros` do Firestore.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "nomeCompleto": "João da Silva",
  "cpf": "12345678901",
  "telefone": "92991234567",
  "municipio": "Manaus",
  "uf": "AM",
  "bairro": "Novo Aleixo"
}
```

**Exemplo com fetch:**
```javascript
const response = await fetch('https://seu-dominio.vercel.app/api/leads', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nomeCompleto: 'João da Silva',
    cpf: '12345678901',
    telefone: '92991234567',
    municipio: 'Manaus',
    uf: 'AM',
    bairro: 'Novo Aleixo'
  })
})

const data = await response.json()
console.log(data) // { message: 'Cadastro realizado com sucesso.', id: '...' }
```

**Exemplo com curl:**
```bash
curl -X POST https://seu-dominio.vercel.app/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "nomeCompleto": "João da Silva",
    "cpf": "12345678901",
    "telefone": "92991234567",
    "municipio": "Manaus",
    "uf": "AM",
    "bairro": "Novo Aleixo"
  }'
```

**Respostas:**

| Status | Descrição |
|--------|-----------|
| 201 | Cadastro salvo com sucesso |
| 400 | Dados inválidos ou campos ausentes |
| 405 | Método não permitido |
| 500 | Erro interno do servidor |

---

## Integração com site estático (HTML puro)

Exemplo de formulário para adicionar ao site Crenorte:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Pré-Cadastro Crenorte</title>
</head>
<body>
  <form id="formCadastro">
    <input type="text"   id="nomeCompleto" placeholder="Nome completo" required />
    <input type="text"   id="cpf"          placeholder="CPF (somente números)" required />
    <input type="text"   id="telefone"     placeholder="Telefone (somente números)" required />
    <input type="text"   id="municipio"    placeholder="Município" required />
    <input type="text"   id="uf"           placeholder="UF (ex: AM)" maxlength="2" required />
    <input type="text"   id="bairro"       placeholder="Bairro" required />
    <button type="submit">Enviar</button>
    <p id="mensagem"></p>
  </form>

  <script>
    const API_URL = 'https://seu-dominio.vercel.app/api/leads'

    document.getElementById('formCadastro').addEventListener('submit', async function (e) {
      e.preventDefault()

      const payload = {
        nomeCompleto: document.getElementById('nomeCompleto').value,
        cpf:          document.getElementById('cpf').value,
        telefone:     document.getElementById('telefone').value,
        municipio:    document.getElementById('municipio').value,
        uf:           document.getElementById('uf').value,
        bairro:       document.getElementById('bairro').value,
      }

      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        const data = await res.json()

        if (res.ok) {
          document.getElementById('mensagem').textContent = 'Cadastro realizado com sucesso!'
          e.target.reset()
        } else {
          document.getElementById('mensagem').textContent = 'Erro: ' + (data.error ?? 'Tente novamente.')
        }
      } catch (err) {
        document.getElementById('mensagem').textContent = 'Erro de conexão. Tente novamente.'
      }
    })
  </script>
</body>
</html>
```

---

## Estrutura do projeto

```
crenorte-leads-api/
├── app/
│   ├── api/
│   │   ├── leads/route.ts       # POST público — recebe dados do site
│   │   └── dashboard/route.ts   # GET protegido — dados para o dashboard
│   ├── dashboard/page.tsx       # Dashboard administrativo
│   ├── login/page.tsx           # Página de login
│   ├── layout.tsx
│   └── page.tsx                 # Redirect → /dashboard
├── lib/
│   ├── firebase-admin.ts        # Firebase Admin SDK (server-side)
│   └── firebase-client.ts       # Firebase Client SDK (client-side)
├── hooks/
│   └── useAuth.ts               # Hook de autenticação
├── middleware.ts                 # Proteção de rotas
├── .env.local.example
├── vercel.json
└── package.json
```

let products = [], photos = [], editing = null;
let db = null;

const money = v => Number(v || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

/* =========================
   FIREBASE - SOMENTE FIRESTORE
   ========================= */

try {
  if (
    window.FIREBASE_CONFIG?.projectId &&
    !String(window.FIREBASE_CONFIG.projectId).startsWith('COLE_')
  ) {
    if (!firebase.apps.length) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }

    db = firebase.firestore();
  }
} catch (e) {
  console.error('Erro ao iniciar Firebase:', e);
}

/* =========================
   LOGIN
   ========================= */

function login() {
  const e = document.getElementById('loginEmail').value.trim();
  const p = document.getElementById('loginPass').value;

  if (!db) {
    document.getElementById('loginMsg').textContent =
      'Configure o Firebase antes de entrar.';
    return;
  }

  firebase.auth()
    .signInWithEmailAndPassword(e, p)
    .catch(err => {
      console.error(err);
      document.getElementById('loginMsg').textContent =
        'E-mail ou senha incorretos.';
    });
}

function logout() {
  firebase.auth().signOut();
}

function showApp() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  loadSettings();
  loadProducts();
}

function showLogin() {
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

/* =========================
   CONFIGURAÇÕES
   ========================= */

function loadSettings() {
  const s = JSON.parse(
    localStorage.getItem('lagartin_settings_v2') || '{}'
  );

  document.getElementById('whatsapp').value = s.whatsapp || '';
}

/* =========================
   PRODUTOS
   ========================= */

function loadProducts() {
  db.collection('products')
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      s => {
        products = s.docs.map(d => ({
          id: d.id,
          ...d.data(),
          category: d.data().category || 'Roupas'
        }));

        renderList();
        updateStats();
      },
      e => {
        console.error('Erro ao carregar produtos:', e);

        document.getElementById('productList').innerHTML =
          '<div class="notice">Erro ao carregar produtos.</div>';
      }
    );
}

/* =========================
   COMPRESSÃO DAS FOTOS
   SEM FIREBASE STORAGE
   ========================= */

function readAndCompress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error);

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => reject(
        new Error('Não foi possível abrir a imagem.')
      );

      img.onload = async () => {
        try {
          /*
            Mantemos as imagens pequenas para caber
            no limite de 1 MiB do Firestore.
          */

          const maxSize = 900;

          let scale = Math.min(
            1,
            maxSize / Math.max(img.width, img.height)
          );

          let width = Math.max(
            1,
            Math.round(img.width * scale)
          );

          let height = Math.max(
            1,
            Math.round(img.height * scale)
          );

          const canvas = document.createElement('canvas');

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');

          ctx.drawImage(
            img,
            0,
            0,
            width,
            height
          );

          /*
            Começamos com qualidade 0.70.
            Se ficar grande demais, diminuímos.
          */

          let quality = 0.70;
          let dataUrl = canvas.toDataURL(
            'image/jpeg',
            quality
          );

          let blob = await (
            await fetch(dataUrl)
          ).blob();

          /*
            Objetivo: cada foto ter no máximo
            aproximadamente 120 KB.
          */

          while (blob.size > 120 * 1024 && quality > 0.35) {
            quality -= 0.05;

            dataUrl = canvas.toDataURL(
              'image/jpeg',
              quality
            );

            blob = await (
              await fetch(dataUrl)
            ).blob();
          }

          /*
            Se ainda estiver grande, reduzimos
            fisicamente a resolução.
          */

          while (
            blob.size > 120 * 1024 &&
            width > 500 &&
            height > 500
          ) {
            width = Math.round(width * 0.85);
            height = Math.round(height * 0.85);

            canvas.width = width;
            canvas.height = height;

            ctx.clearRect(
              0,
              0,
              width,
              height
            );

            ctx.drawImage(
              img,
              0,
              0,
              width,
              height
            );

            dataUrl = canvas.toDataURL(
              'image/jpeg',
              0.55
            );

            blob = await (
              await fetch(dataUrl)
            ).blob();
          }

          resolve(dataUrl);

        } catch (err) {
          reject(err);
        }
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

/* =========================
   SELEÇÃO DE FOTOS
   ========================= */

async function previewPhotos(e) {
  const files = [...e.target.files]
    .filter(f => f.type.startsWith('image/'));

  if (!files.length) return;

  /*
    Até 4 fotos por produto.
  */

  const selected = files.slice(0, 4);

  const st = document.getElementById('photoStatus');

  st.style.display = 'block';

  st.textContent =
    `Preparando ${selected.length} foto${
      selected.length > 1 ? 's' : ''
    }...`;

  try {
    photos = await Promise.all(
      selected.map(readAndCompress)
    );

    renderPhotos();

    st.textContent =
      `${photos.length} foto${
        photos.length > 1 ? 's' : ''
      } pronta${
        photos.length > 1 ? 's' : ''
      }.`;

  } catch (err) {
    console.error(err);

    photos = [];

    renderPhotos();

    st.textContent =
      'Erro ao preparar as fotos.';
  }
}

/* =========================
   VISUALIZAÇÃO DAS FOTOS
   ========================= */

function renderPhotos() {
  document.getElementById('photoPreview').innerHTML =
    photos.map((src, i) => `
      <div class="photoBox">
        <img src="${src}">
        <button
          type="button"
          onclick="photos.splice(${i},1);renderPhotos()"
        >
          ✕
        </button>
      </div>
    `).join('');

  document.getElementById('photoStatus').style.display =
    photos.length ? 'block' : 'none';
}

/* =========================
   SALVAR PRODUTO
   ========================= */

async function saveProduct() {
  const name =
    document.getElementById('name').value.trim();

  const price =
    parseFloat(
      document.getElementById('price').value
    );

  const stock =
    parseInt(
      document.getElementById('stock').value || '0'
    );

  if (!name || Number.isNaN(price)) {
    msg(
      'Preencha nome e preço.',
      'error'
    );
    return;
  }

  if (!db) {
    msg(
      'Firebase não configurado.',
      'error'
    );
    return;
  }

  const btn =
    document.getElementById('saveBtn');

  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    /*
      Cria ou recupera o documento.
    */

    const ref = editing
      ? db.collection('products').doc(editing)
      : db.collection('products').doc();

    /*
      IMPORTANTE:
      As fotos já estão comprimidas em Data URL.
      Elas serão salvas diretamente no Firestore.
    */

    const data = {
      name: name,

      category:
        document.getElementById('category').value,

      price: price,

      stock: stock,

      condition:
        document.getElementById('condition').value,

      brand:
        document.getElementById('brand').value.trim(),

      description:
        document.getElementById('description').value.trim(),

      images: photos,

      emoji: {
        'Roupas': '👕',
        'Pokémon TCG': '🃏',
        'Hot Wheels': '🚗',
        'Perfumes': '🌹',
        'Ofertas': '🔥'
      }[
        document.getElementById('category').value
      ] || '📦'
    };

    /*
      Novo produto
    */

    if (!editing) {
      data.createdAt =
        firebase.firestore.FieldValue.serverTimestamp();

      await ref.set(data);

    } else {

      /*
        Produto existente
      */

      await ref.update(data);
    }

    cancelEdit();

    msg(
      'Produto salvo online com sucesso!',
      'success'
    );

  } catch (e) {

    console.error(
      'ERRO AO SALVAR PRODUTO:',
      e
    );

    let texto =
      'Não foi possível salvar o produto.';

    if (
      e &&
      e.code === 'permission-denied'
    ) {
      texto =
        'Permissão negada pelo Firestore.';
    }

    if (
      e &&
      e.message &&
      e.message.includes('maximum allowed size')
    ) {
      texto =
        'As fotos ficaram grandes demais. Escolha fotos menores.';
    }

    msg(
      texto,
      'error'
    );

  } finally {

    btn.disabled = false;

    btn.textContent =
      editing
        ? 'Salvar alterações'
        : 'Publicar produto';
  }
}

/* =========================
   EDITAR PRODUTO
   ========================= */

function editProduct(id) {
  const p =
    products.find(x => x.id === id);

  if (!p) return;

  editing = id;

  document.getElementById('name').value =
    p.name || '';

  document.getElementById('category').value =
    p.category || 'Roupas';

  document.getElementById('price').value =
    p.price || '';

  document.getElementById('stock').value =
    p.stock || 0;

  document.getElementById('condition').value =
    p.condition || 'Novo';

  document.getElementById('brand').value =
    p.brand || '';

  document.getElementById('description').value =
    p.description || '';

  photos = [...(p.images || [])];

  renderPhotos();

  document.getElementById('formTitle').textContent =
    'Editar produto';

  document.getElementById('saveBtn').textContent =
    'Salvar alterações';

  document.getElementById('cancelBtn')
    .classList.remove('hidden');

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/* =========================
   CANCELAR EDIÇÃO
   ========================= */

function cancelEdit() {
  editing = null;

  [
    'name',
    'price',
    'brand',
    'description'
  ].forEach(id => {
    document.getElementById(id).value = '';
  });

  document.getElementById('stock').value = 1;

  photos = [];

  renderPhotos();

  document.getElementById('formTitle').textContent =
    'Adicionar produto';

  document.getElementById('saveBtn').textContent =
    'Publicar produto';

  document.getElementById('cancelBtn')
    .classList.add('hidden');

  document.getElementById('photoInput').value =
    '';

  document.getElementById('photoStatus')
    .style.display = 'none';
}

/* =========================
   EXCLUIR PRODUTO
   ========================= */

async function removeProduct(id) {
  if (!confirm('Excluir este produto?')) {
    return;
  }

  try {
    await db
      .collection('products')
      .doc(id)
      .delete();

  } catch (e) {
    console.error(e);

    alert(
      'Não foi possível excluir.'
    );
  }
}

/* =========================
   LISTA DE PRODUTOS
   ========================= */

function renderList() {
  const q =
    (
      document.getElementById('adminSearch')
        ?.value || ''
    ).toLowerCase();

  const list =
    products.filter(p =>
      (
        p.name +
        ' ' +
        p.category +
        ' ' +
        (p.brand || '')
      )
      .toLowerCase()
      .includes(q)
    );

  document.getElementById('productList').innerHTML =
    list.length
      ? list.map(p => `
        <div class="item">

          <div class="thumb">
            ${
              p.images?.[0]
                ? `<img src="${p.images[0]}">`
                : p.emoji || '📦'
            }
          </div>

          <div class="itemmain">

            <strong>
              ${esc(p.name)}
            </strong>

            <div class="meta">
              ${esc(p.category)}
              ·
              ${money(p.price)}
              ·
              estoque ${p.stock}
            </div>

          </div>

          <div class="actions">

            <button
              class="btn secondary"
              onclick="editProduct('${p.id}')"
            >
              Editar
            </button>

            <button
              class="btn danger"
              onclick="removeProduct('${p.id}')"
            >
              Excluir
            </button>

          </div>

        </div>
      `).join('')

      : '<div class="notice">Nenhum produto cadastrado.</div>';
}

/* =========================
   ESTATÍSTICAS
   ========================= */

function updateStats() {
  document.getElementById(
    'statProducts'
  ).textContent =
    products.length;

  document.getElementById(
    'statStock'
  ).textContent =
    products.reduce(
      (a, p) =>
        a + Number(p.stock || 0),
      0
    );

  document.getElementById(
    'statValue'
  ).textContent =
    money(
      products.reduce(
        (a, p) =>
          a +
          Number(p.stock || 0) *
          Number(p.price || 0),
        0
      )
    );
}

/* =========================
   CONFIGURAÇÕES WHATSAPP
   ========================= */

function saveSettings() {
  localStorage.setItem(
    'lagartin_settings_v2',
    JSON.stringify({
      whatsapp:
        document.getElementById('whatsapp')
          .value
          .replace(/\D/g, '')
    })
  );

  document.getElementById(
    'settingsMsg'
  ).className = 'success';

  document.getElementById(
    'settingsMsg'
  ).textContent =
    'WhatsApp salvo neste aparelho.';
}

/* =========================
   MENSAGENS
   ========================= */

function msg(t, c) {
  const x =
    document.getElementById('formMsg');

  x.className =
    c === 'success'
      ? 'success'
      : 'error';

  x.textContent = t;

  setTimeout(() => {
    x.textContent = '';
  }, 3500);
}

/* =========================
   ESCAPE HTML
   ========================= */

function esc(s) {
  return String(s ?? '')
    .replace(
      /[&<>'"]/g,
      m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[m])
    );
}

/* =========================
   AUTENTICAÇÃO
   ========================= */

if (db) {

  firebase.auth()
    .onAuthStateChanged(user => {

      if (
        user &&
        user.email ===
        window.LAGARTIN_ADMIN_EMAIL
      ) {

        showApp();

      } else {

        if (user) {
          firebase.auth().signOut();
        }

        showLogin();
      }

    });

} else {

  showLogin();

            }

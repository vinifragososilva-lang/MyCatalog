let products = [], photos = [], editing = null;
let db = null, storage = null;

const money = v => Number(v || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

try {
  if (
    window.FIREBASE_CONFIG?.projectId &&
    !String(window.FIREBASE_CONFIG.projectId).startsWith('COLE_')
  ) {
    if (!firebase.apps.length) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }

    db = firebase.firestore();
    storage = firebase.storage();
  }
} catch (e) {
  console.error('Erro ao inicializar Firebase:', e);
}

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
      document.getElementById('loginMsg').textContent =
        'E-mail ou senha incorretos.';
      console.error(err);
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

function loadSettings() {
  const s = JSON.parse(
    localStorage.getItem('lagartin_settings_v2') || '{}'
  );

  document.getElementById('whatsapp').value = s.whatsapp || '';
}

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
   PREPARAÇÃO DAS FOTOS
   ========================= */

function readAndCompress(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();

    r.onerror = () => reject(r.error);

    r.onload = () => {
      const img = new Image();

      img.onerror = () => resolve(r.result);

      img.onload = () => {
        const max = 1600;

        const scale = Math.min(
          1,
          max / Math.max(img.width, img.height)
        );

        const w = Math.max(
          1,
          Math.round(img.width * scale)
        );

        const h = Math.max(
          1,
          Math.round(img.height * scale)
        );

        const c = document.createElement('canvas');

        c.width = w;
        c.height = h;

        const ctx = c.getContext('2d');

        if (!ctx) {
          resolve(r.result);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        resolve(
          c.toDataURL('image/jpeg', 0.82)
        );
      };

      img.src = r.result;
    };

    r.readAsDataURL(file);
  });
}

async function previewPhotos(e) {
  const files = [...e.target.files]
    .filter(f => f.type.startsWith('image/'));

  if (!files.length) return;

  const st = document.getElementById('photoStatus');

  st.style.display = 'block';

  st.textContent =
    `Preparando ${files.length} foto${files.length > 1 ? 's' : ''}...`;

  try {
    photos = await Promise.all(
      files.map(readAndCompress)
    );

    renderPhotos();

    st.textContent =
      `${photos.length} foto${photos.length > 1 ? 's' : ''} pronta${photos.length > 1 ? 's' : ''}.`;

  } catch (err) {
    console.error('Erro ao preparar fotos:', err);

    st.textContent =
      'Erro ao preparar as fotos.';
  }
}

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
   UPLOAD PARA FIREBASE
   ========================= */

async function uploadDataUrl(dataUrl, productId, index) {

  if (!dataUrl.startsWith('data:')) {
    return dataUrl;
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const ref = storage.ref(
    `products/${productId}/${Date.now()}_${index}.jpg`
  );

  const task = ref.put(blob, {
    contentType: 'image/jpeg'
  });

  await new Promise((resolve, reject) => {

    let finished = false;

    const timer = setTimeout(() => {

      if (finished) return;

      finished = true;

      try {
        task.cancel();
      } catch (e) {
        console.error(e);
      }

      reject(
        new Error(
          'Tempo esgotado ao enviar a foto para o Firebase Storage.'
        )
      );

    }, 45000);

    task.on(
      firebase.storage.TaskEvent.STATE_CHANGED,

      snapshot => {
        if (snapshot.totalBytes) {
          const percent = Math.round(
            (snapshot.bytesTransferred /
              snapshot.totalBytes) * 100
          );

          const status =
            document.getElementById('photoStatus');

          if (status) {
            status.style.display = 'block';
            status.textContent =
              `Enviando foto ${index + 1}: ${percent}%`;
          }
        }
      },

      error => {

        if (finished) return;

        finished = true;

        clearTimeout(timer);

        reject(error);
      },

      () => {

        if (finished) return;

        finished = true;

        clearTimeout(timer);

        resolve();
      }
    );
  });

  return await ref.getDownloadURL();
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

  if (!db || !storage) {
    msg(
      'Firebase não configurado.',
      'error'
    );

    return;
  }

  const btn =
    document.getElementById('saveBtn');

  const wasEditing = !!editing;

  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {

    const ref = editing
      ? db.collection('products').doc(editing)
      : db.collection('products').doc();

    /* Envia todas as fotos */

    const urls = await Promise.all(
      photos.map((x, i) =>
        uploadDataUrl(
          x,
          ref.id,
          i
        )
      )
    );

    const category =
      document.getElementById('category').value;

    const data = {

      name: name,

      category: category,

      price: price,

      stock: stock,

      condition:
        document.getElementById('condition').value,

      brand:
        document.getElementById('brand').value.trim(),

      description:
        document.getElementById('description').value.trim(),

      images: urls,

      emoji: {
        'Roupas': '👕',
        'Pokémon TCG': '🃏',
        'Hot Wheels': '🚗',
        'Perfumes': '🌹',
        'Ofertas': '🔥'
      }[category] || '📦'
    };

    if (editing) {

      await ref.update(data);

    } else {

      data.createdAt =
        firebase.firestore.FieldValue.serverTimestamp();

      await ref.set(data);
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

    let errorMessage =
      'Não foi possível salvar o produto.';

    if (
      e &&
      e.code === 'storage/unauthorized'
    ) {

      errorMessage =
        'Firebase Storage recusou o envio. Verifique as regras do Storage.';

    } else if (
      e &&
      e.code === 'storage/canceled'
    ) {

      errorMessage =
        'O envio da foto foi cancelado.';

    } else if (
      e &&
      e.code === 'storage/unknown'
    ) {

      errorMessage =
        'O Firebase Storage apresentou um erro.';

    } else if (
      e &&
      e.message &&
      e.message.includes('Tempo esgotado')
    ) {

      errorMessage =
        'O envio da foto demorou mais de 45 segundos.';

    } else if (
      e &&
      e.message
    ) {

      errorMessage =
        'Erro: ' + e.message;
    }

    msg(
      errorMessage,
      'error'
    );

  } finally {

    btn.disabled = false;

    btn.textContent =
      wasEditing
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
    p.name;

  document.getElementById('category').value =
    p.category;

  document.getElementById('price').value =
    p.price;

  document.getElementById('stock').value =
    p.stock || 0;

  document.getElementById('condition').value =
    p.condition || 'Novo';

  document.getElementById('brand').value =
    p.brand || '';

  document.getElementById('description').value =
    p.description || '';

  photos = [
    ...(p.images || [])
  ];

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

  document.getElementById('photoStatus').style.display =
    'none';
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
      document.getElementById('adminSearch')?.value || ''
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
  ).textContent = products.length;

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
   CONFIGURAÇÕES
   ========================= */

function saveSettings() {

  localStorage.setItem(
    'lagartin_settings_v2',
    JSON.stringify({
      whatsapp:
        document
          .getElementById('whatsapp')
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
  }, 6000);
}

/* =========================
   SEGURANÇA DO TEXTO
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

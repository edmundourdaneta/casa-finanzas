/* Casa Finanzas — Supabase */
(() => {
"use strict";

const cfg = window.CASA_CONFIG || {};
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR"
}).format(Number(n) || 0);
const today = () => new Date().toLocaleDateString("en-CA", {
  timeZone: "Europe/Madrid"
});
const escape = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;",
  '"':"&quot;", "'":"&#39;"
}[c]));

if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
  $("setup").classList.remove("hidden");
  $("login").classList.add("hidden");
  return;
}

const db = window.supabase.createClient(
  cfg.supabaseUrl,
  cfg.supabasePublishableKey,
  { auth: { persistSession:true, autoRefreshToken:true } }
);

let purchases = [];
let installments = [];
let accounts = [];
let user = null;
let busy = false;

const personA = () => cfg.personA || "Persona A";
const personB = () => cfg.personB || "Persona B";

function notify(message, bad=false) {
  const el = $("toast");
  el.textContent = message;
  el.style.background = bad ? "#a44743" : "#3e5841";
  el.classList.add("visible");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => el.classList.remove("visible"), 4000);
}

function err(e) {
  console.error(e);
  notify(e?.message || "No se pudo completar la operación", true);
}

function closeDialogs() {
  document.querySelectorAll("dialog[open]").forEach(d => d.close());
}

document.querySelectorAll(".close").forEach(b =>
  b.addEventListener("click", closeDialogs)
);

document.querySelectorAll("dialog").forEach(d =>
  d.addEventListener("click", e => {
    if (e.target === d) d.close();
  })
);

async function load() {
  const results = await Promise.all(
    ["purchases", "installments", "accounts"].map(
      t => db.from(t).select("*")
    )
  );
  const problem = results.find(r => r.error);
  if (problem) throw problem.error;

  purchases = results[0].data || [];
  installments = results[1].data || [];
  accounts = results[2].data || [];
  render();
}

function showAuth(logged) {
  $("login").classList.toggle("hidden", logged);
  $("dashboard").classList.toggle("hidden", !logged);
  $("logout").classList.toggle("hidden", !logged);
}

async function sessionChange(session) {
  const id = session?.user?.id || null;
  if (id === user) return;
  user = id;
  showAuth(!!id);

  if (id) {
    try { await load(); }
    catch(e) { err(e); }
  } else {
    purchases = [];
    installments = [];
    accounts = [];
  }
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  const button = e.target.querySelector("button");
  button.disabled = true;
  try {
    const {error} = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });
    if (error) throw error;
    $("password").value = "";
  } catch(e) {
    $("loginError").textContent =
      "No se pudo iniciar sesión. Comprueba tus credenciales.";
  } finally {
    button.disabled = false;
  }
});

$("logout").onclick = async () => {
  const {error} = await db.auth.signOut();
  if (error) err(error);
};

db.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => sessionChange(session), 0);
});
db.auth.getSession().then(({data}) => sessionChange(data.session));

function rowsFor(id) {
  return installments
    .filter(i => i.purchase_id === id)
    .sort((x,y) => x.number - y.number);
}

function allSorted() {
  return [...installments].sort((x,y) =>
    x.due_date.localeCompare(y.due_date)
  );
}

function purchaseTitle(id) {
  return purchases.find(p => p.id === id)?.name || "Compra";
}

function accountTitle(id) {
  return accounts.find(a => a.id === id)?.name || "Sin cuenta definida";
}

function line(i) {
  return `
    <div class="rowline">
      <div>
        <strong>${escape(purchaseTitle(i.purchase_id))}</strong>
        <small>
          ${escape(i.due_date)} ·
          ${escape(accountTitle(i.account_id))} ·
          Cuota ${i.number}
          ${i.status === "paid" ? " · Pagada" : ""}
        </small>
      </div>
      <div style="text-align:right">
        <div class="amount">${fmt(i.amount)}</div>
        <button class="quiet" data-edit-payment="${i.id}">
          Editar ↗
        </button>
      </div>
    </div>
  `;
}

function render() {
  const paid = installments.filter(i => i.status === "paid");
  const pending = installments.filter(i => i.status !== "paid");
  const sum = xs => xs.reduce((s,x) => s + Number(x.amount), 0);

  $("total").textContent = fmt(
    purchases.reduce((s,p) => s + Number(p.total_amount), 0)
  );
  $("paid").textContent = fmt(sum(paid));
  $("pending").textContent = fmt(sum(pending));

  const limit = new Date(today() + "T12:00:00");
  limit.setDate(limit.getDate() + 30);
  const lim = [
    limit.getFullYear(),
    String(limit.getMonth()+1).padStart(2,"0"),
    String(limit.getDate()).padStart(2,"0")
  ].join("-");

  $("soon").textContent = fmt(
    sum(pending.filter(i => i.due_date >= today() && i.due_date <= lim))
  );

  $("nextList").innerHTML = allSorted()
    .filter(i => i.status !== "paid")
    .slice(0,6)
    .map(line).join("")
    || '<p class="empty">No hay pagos pendientes 🌿</p>';

  let net = 0;
  for (const i of paid) {
    const p = purchases.find(p => p.id === i.purchase_id);
    if (!p) continue;
    const amount = Number(i.amount);
    const shareA = amount * Number(p.split_a) / 100;
    net += (i.paid_by === "a" ? amount : 0) - shareA;
  }

  const debtor = net >= 0 ? personB() : personA();
  const receiver = net >= 0 ? personA() : personB();

  $("settlement").innerHTML = `
    <div class="settlement">
      ${Math.abs(net) < .005
        ? "<b>Estáis al día ✨</b><p>Los pagos registrados están equilibrados.</p>"
        : `<b>${fmt(Math.abs(net))}</b>
           <p><strong>${escape(debtor)}</strong> debe a
           <strong>${escape(receiver)}</strong>.</p>`}
    </div>
  `;

  $("purchaseList").innerHTML = [...purchases]
    .sort((x,y) => y.created_at.localeCompare(x.created_at))
    .map(p => {
      const rows = rowsFor(p.id);
      const num = rows.filter(i => i.status === "paid").length;
      const pct = rows.length ? 100 * num / rows.length : 0;
      const paidSum = sum(rows.filter(i => i.status === "paid"));
      const pendingSum = sum(rows.filter(i => i.status !== "paid"));

      return `
        <article class="purchase">
          <div class="heading">
            <h3>${escape(p.name)}</h3>
            <span class="pill ${num===rows.length ? "" : "pending"}">
              ${num}/${rows.length} pagadas
            </span>
          </div>
          <p class="meta">
            ${escape(p.category)} · ${fmt(p.total_amount)}
            · ${escape(personA())} ${Number(p.split_a)}%
            / ${escape(personB())} ${100-Number(p.split_a)}%
          </p>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <p class="meta">
            Pagado: ${fmt(paidSum)} · Pendiente: ${fmt(pendingSum)}
          </p>
          <div class="buttons">
            <button class="secondary" data-edit-purchase="${p.id}">
              Editar compra
            </button>
            <button class="quiet danger" data-delete-purchase="${p.id}">
              Eliminar
            </button>
          </div>
        </article>
      `;
    }).join("")
    || '<p class="empty">Todavía no hay compras. Añade la primera.</p>';

  const filter = $("paymentFilter").value;
  $("installmentList").innerHTML = allSorted()
    .filter(i => filter === "all" ||
      (filter === "paid" ? i.status === "paid" : i.status !== "paid"))
    .map(line).join("")
    || '<p class="empty">No hay cuotas en esta vista.</p>';

  $("accountList").innerHTML = accounts.map(x => `
    <article class="accountcard">
      <h3>${escape(x.name)}</h3>
      <p class="muted">${escape(x.owner_note || "Sin nota")}</p>
      <p class="hint">
        Cuenta usada en ${installments.filter(i => i.account_id === x.id).length} cuotas
      </p>
      <button class="quiet danger" data-delete-account="${x.id}">
        Eliminar
      </button>
    </article>
  `).join("")
  || '<p class="empty">Añade tu primera cuenta de débito.</p>';
}

function accountOptions(el, selected="") {
  el.innerHTML = '<option value="">Sin especificar</option>' +
    accounts.map(x =>
      `<option value="${x.id}">${escape(x.name)}</option>`
    ).join("");
  el.value = selected || "";
}

function monthlyDates(start,count) {
  const [y,m,d] = start.split("-").map(Number);
  return Array.from({length:count}, (_,i) => {
    const v = new Date(Date.UTC(y,m-1+i,1));
    const yy = v.getUTCFullYear();
    const mm = v.getUTCMonth()+1;
    const last = new Date(Date.UTC(yy,mm,0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2,"0")}-${String(Math.min(d,last)).padStart(2,"0")}`;
  });
}

function installmentsFrom(
  total,count,start,account,pid,
  firstPaid=false,firstAmount=0,firstDate="",payer="a"
) {
  const cents = Math.round(Number(total)*100);
  const firstCents = firstPaid ? Math.round(Number(firstAmount)*100) : 0;
  const remaining = count - (firstPaid ? 1 : 0);
  const remainder = cents - firstCents;

  if (firstPaid && (count < 2 || firstCents <= 0 || remainder <= 0)) {
    throw new Error("La cuota inicial debe ser menor que el total.");
  }

  const dates = monthlyDates(start,remaining);
  const base = Math.floor(remainder/remaining);

  const result = dates.map((d,j) => ({
    purchase_id:pid,
    number:j+1+(firstPaid?1:0),
    amount:(base+(j===remaining-1 ? remainder-base*remaining : 0))/100,
    due_date:d,
    account_id:account||null,
    status:"pending",
    paid_by:"a"
  }));

  if(firstPaid) {
    result.unshift({
      purchase_id:pid,
      number:1,
      amount:firstCents/100,
      due_date:firstDate,
      account_id:account||null,
      status:"paid",
      paid_at:firstDate,
      paid_by:payer
    });
  }
  return result;
}

$("pFirstPaid").addEventListener("change", () => {
  const active = $("pFirstPaid").checked;
  $("initialPaymentFields").classList.toggle("hidden", !active);
  $("pFirstAmount").required = active;
  $("pFirstDate").required = active;
});

$("newPurchase").onclick = () => {
  $("purchaseForm").reset();
  $("purchaseId").value = "";
  $("purchaseTitle").textContent = "Nueva compra";
  $("pDate").value = today();
  $("pFirstDate").value = today();
  $("pFirstPaid").checked = false;
  $("initialPaymentFields").classList.add("hidden");
  $("initialPaymentBlock").classList.remove("hidden");
  $("pFirstAmount").required = false;
  $("pFirstDate").required = false;
  accountOptions($("pAccount"));
  ["pCount","pAmount","pDate","pAccount"].forEach(k => $(k).disabled=false);
  $("purchaseDialog").showModal();
};

$("purchaseForm").onsubmit = async e => {
  e.preventDefault();
  if (busy) return;

  const id = $("purchaseId").value;
  const amount = Number($("pAmount").value);
  const count = Number($("pCount").value);
  const split = Number($("pSplit").value);

  if(amount<=0 || !Number.isInteger(count) || count<1 || count>120 ||
     split<0 || split>100) {
    return notify("Revisa importe, cuotas y reparto.",true);
  }

  const firstPaid = !id && $("pFirstPaid").checked;
  const firstAmount = Number($("pFirstAmount").value);

  if(firstPaid && (count<2 || firstAmount<=0 || firstAmount>=amount ||
     !$("pFirstDate").value)) {
    return notify("Revisa la primera cuota pagada.",true);
  }

  busy = true;
  try {
    const payload = {
      name:$("pName").value.trim(),
      category:$("pCategory").value,
      total_amount:amount,
      split_a:split,
      notes:$("pNotes").value.trim()
    };

    if(id) {
      const {error} = await db.from("purchases")
        .update(payload).eq("id",id);
      if(error) throw error;
    } else {
      const {data,error} = await db.from("purchases")
        .insert(payload).select("id").single();
      if(error) throw error;

      const parts = installmentsFrom(
        amount,count,$("pDate").value,$("pAccount").value,
        data.id,firstPaid,firstAmount,
        $("pFirstDate").value,$("pFirstPayer").value
      );

      const result = await db.from("installments").insert(parts);
      if(result.error) {
        await db.from("purchases").delete().eq("id",data.id);
        throw result.error;
      }
    }
    closeDialogs();
    await load();
    notify("Compra guardada");
  } catch(ex) {
    err(ex);
  } finally {
    busy=false;
  }
};

$("newAccount").onclick = () => {
  $("accountForm").reset();
  $("accountDialog").showModal();
};

$("accountForm").onsubmit = async e => {
  e.preventDefault();
  if(busy) return;
  busy=true;
  try {
    const {error}=await db.from("accounts").insert({
      name:$("aName").value.trim(),
      owner_note:$("aOwner").value.trim()
    });
    if(error) throw error;
    closeDialogs();
    await load();
    notify("Cuenta añadida");
  } catch(ex) {
    err(ex);
  } finally {
    busy=false;
  }
};

function editPayment(id) {
  const i=installments.find(x => x.id===id);
  if(!i) return;
  $("iId").value=id;
  $("iDescription").textContent=`${purchaseTitle(i.purchase_id)} · Cuota ${i.number}`;
  $("iAmount").value=i.amount;
  $("iDate").value=i.due_date;
  accountOptions($("iAccount"),i.account_id);
  $("iStatus").value=i.status;
  $("iPaidDate").value=i.paid_at||"";
  $("iPayer").value=i.paid_by||"a";
  $("paymentDialog").showModal();
}

$("paymentForm").onsubmit = async e => {
  e.preventDefault();
  if(busy) return;

  const paid=$("iStatus").value==="paid";
  if(paid && !$("iPaidDate").value) $("iPaidDate").value=today();

  busy=true;
  try {
    const {error}=await db.from("installments").update({
      amount:Number($("iAmount").value),
      due_date:$("iDate").value,
      account_id:$("iAccount").value||null,
      status:paid?"paid":"pending",
      paid_at:paid?$("iPaidDate").value:null,
      paid_by:$("iPayer").value
    }).eq("id",$("iId").value);
    if(error) throw error;
    closeDialogs();
    await load();
    notify("Cuota actualizada");
  } catch(ex) {
    err(ex);
  } finally {
    busy=false;
  }
};

document.addEventListener("click",async e => {
  const t=e.target.closest(
    "[data-edit-payment],[data-edit-purchase],[data-delete-purchase],[data-delete-account]"
  );
  if(!t)return;

  if(t.dataset.editPayment) {
    editPayment(t.dataset.editPayment);
    return;
  }

  if(t.dataset.editPurchase) {
    const p=purchases.find(x=>x.id===t.dataset.editPurchase);
    if(!p)return;
    $("purchaseForm").reset();
    $("purchaseId").value=p.id;
    $("purchaseTitle").textContent="Editar compra";
    $("initialPaymentBlock").classList.add("hidden");
    $("pName").value=p.name;
    $("pCategory").value=p.category;
    $("pAmount").value=p.total_amount;
    $("pSplit").value=p.split_a;
    $("pNotes").value=p.notes||"";
    $("pCount").value=rowsFor(p.id).length;
    $("pDate").value=rowsFor(p.id)[0]?.due_date||today();
    accountOptions($("pAccount"),rowsFor(p.id)[0]?.account_id);
    ["pCount","pAmount","pDate","pAccount"].forEach(k=>$(k).disabled=true);
    $("purchaseDialog").showModal();
    return;
  }

  if(t.dataset.deletePurchase) {
    const id=t.dataset.deletePurchase;
    if(!confirm("¿Eliminar esta compra y TODAS sus cuotas?"))return;
    try {
      const {error}=await db.from("purchases").delete().eq("id",id);
      if(error)throw error;
      await load();
      notify("Compra eliminada");
    }catch(ex){err(ex);}
    return;
  }

  if(t.dataset.deleteAccount) {
    if(!confirm("¿Eliminar esta cuenta?"))return;
    try {
      const {error}=await db.from("accounts")
        .delete().eq("id",t.dataset.deleteAccount);
      if(error)throw error;
      await load();
      notify("Cuenta eliminada");
    }catch(ex){err(ex);}
  }
});

document.querySelectorAll("[data-tab]").forEach(btn => {
  btn.onclick=()=>{
    document.querySelectorAll("[data-tab]").forEach(
      b=>b.classList.toggle("active",b===btn)
    );
    document.querySelectorAll(".view").forEach(
      v=>v.classList.toggle("hidden",v.id!==btn.dataset.tab)
    );
  };
});

$("paymentFilter").onchange=render;

$("exportData").onclick=()=>{
  const blob=new Blob([JSON.stringify({
    exported_at:new Date().toISOString(),
    purchases,installments,accounts
  },null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const el=document.createElement("a");
  el.href=url;
  el.download=`casa-finanzas-${today()}.json`;
  el.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};

// Actualización periódica entre dispositivos.
setInterval(()=>{
  if(user && !document.hidden && !document.querySelector("dialog[open]")) {
    load().catch(console.error);
  }
},30000);

})();

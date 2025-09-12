import { supabase } from "@db/supabase.js";

export function initInventory() {

  const cargarInventario = async () => {
    const { data, error } = await supabase
      .from("inventory")
      .select("id, quantity, type, created_at")
      .order("id", { ascending: true });

    const inventoryElement = document.getElementById("inventory");
    if (!inventoryElement) return;

    if (error) {
      console.error("Error al obtener los datos:", error);
      inventoryElement.innerHTML = `
        <div style="padding:20px;background-color:#fdf6f6;border:1px solid #f19999;border-radius:8px;color:#c0392b;font-family:'Segoe UI',sans-serif;text-align:center;">
          ❌ Error al cargar los datos: ${error.message}
        </div>`;
      return;
    }

    let tableHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:14px;box-shadow:0 4px 6px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;margin-top:20px;background-color:white;">
          <thead>
            <tr style="background:linear-gradient(135deg,#3498db,#2980b9);color:white;text-align:left;font-weight:600;">
              <th style="padding:14px 16px;">ID</th>
              <th style="padding:14px 16px;">Tipo</th>
              <th style="padding:14px 16px;">Fecha modificación</th>
              <th style="padding:14px 16px;">Cantidad</th>
              <th style="padding:14px 16px;">Acción</th>
            </tr>
          </thead>
          <tbody>`;

    (data || []).forEach((item) => {
      tableHTML += `
        <tr style="border-bottom:1px solid #ecf0f1;transition:background-color .2s ease;">
          <td style="padding:14px 16px;color:#2c3e50;font-weight:500;">${item.id}</td>
          <td style="padding:14px 16px;color:#34495e;text-transform:capitalize;">${item.type}</td>
          <td style="padding:14px 16px;color:#7f8c8d;font-size:13px;">${new Date(item.created_at).toLocaleString()}</td>
          <td style="padding:14px 16px;">
            <input type="number" id="quantity-${item.id}" value="${item.quantity}" min="0"
              style="width:80px;padding:8px 10px;border:1px solid #bdc3c7;border-radius:6px;text-align:center;font-size:14px;transition:border .2s ease;"
              onfocus="this.style.borderColor='#3498db'" onblur="this.style.borderColor='#bdc3c7'"/>
          </td>
          <td style="padding:14px 16px;">
            <button class="update-btn" data-id="${item.id}"
              style="padding:8px 14px;font-size:13px;font-weight:600;background-color:#27ae60;color:white;border:none;border-radius:6px;cursor:pointer;transition:background-color .2s ease, transform .1s ease;box-shadow:0 1px 3px rgba(0,0,0,0.1);"
              onmouseover="this.style.backgroundColor='#219653'; this.style.transform='scale(1.02)'" onmouseout="this.style.backgroundColor='#27ae60'; this.style.transform='scale(1)'">
              Aceptar
            </button>
          </td>
        </tr>`;
    });

    tableHTML += `</tbody></table></div>`;
    inventoryElement.innerHTML = tableHTML;

    document.querySelectorAll(".update-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-id");
        if (!id) return;

        const input = document.getElementById(`quantity-${id}`);
        if (!(input instanceof HTMLInputElement)) return;

        const newQuantity = parseInt(input.value, 10);
        if (isNaN(newQuantity) || newQuantity < 0) {
          alert("Por favor, ingresa una cantidad válida.");
          return;
        }

        const { error } = await supabase
          .from("inventory")
          .update({ quantity: newQuantity, created_at: new Date().toISOString() })
          .eq("id", id);

        if (error) {
          console.error(`Error al actualizar ID ${id}:`, error);
          alert(`Error al actualizar el ítem ${id}`);
        } else {
          console.log(`✅ Cantidad actualizada para ID ${id}`);
        }
      });
    });
  };

  cargarInventario();

  supabase
    .channel("inventory-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => cargarInventario())
    .subscribe();
}

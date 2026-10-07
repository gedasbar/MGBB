export class DebugPanel {
  enabled: boolean = false;
  
  init() {
    if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
      this.enabled = true;
      this.createUI();
    }
  }

  createUI() {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.background = 'rgba(0,0,0,0.8)';
    container.style.color = '#0f0';
    container.style.padding = '10px';
    container.style.zIndex = '9999';
    container.style.fontFamily = 'monospace';
    
    container.innerHTML = `
      <h3>Debug Panel</h3>
      <button id="dbg-godmode">Toggle God Mode</button><br>
      <button id="dbg-money">+1000 Currency</button><br>
      <button id="dbg-unlock">Unlock All</button><br>
      <button id="dbg-autoplay">Toggle Autoplay</button><br>
      <hr>
      <div id="dbg-stats">
        Entities: 0<br>
        Budget: 0<br>
      </div>
    `;
    
    document.body.appendChild(container);
  }
}

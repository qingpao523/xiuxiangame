/* 封神修道录 · G3 面板迁 Vue 适配器（design/19.0 A4-③）
 * 合同：逻辑零改、Game 不进组件（组件只读传入的 state）、不给 .card 加全局副作用。
 * 做法：把每个 Vue 面板组件挂载到宿主给定的 body 元素，渲染产物仍是 .card / button / 文本，
 *       因此 test/ui-regression.test.js 的黄金快照（card 数 / button 数 / textContent digest）无需改动即可钉死口径。
 * 依赖：全局 Vue（web/vendor/vue.global.prod.js，global build，无构建）；各面板组件注册到 window.PANEL_VUE_UNITS。
 */

"use strict";

const VuePanelMount = (() => {
  // 每个宿主 body 元素只保留一个活动 Vue app，重渲染前先卸载，避免重复挂载与内存泄漏。
  const apps = new WeakMap();

  function available() {
    return typeof Vue !== "undefined" && !!Vue.createApp;
  }

  // mount(component, body, state)：把 component 以 { state } 为根 props 挂载到 body。
  // 组件内只读 state（Game 不进组件），事件回调由组件通过 props/handlers 显式声明。
  function mount(component, body, state) {
    unmount(body);
    body.innerHTML = ""; // 卸载后清屏：既清 Vue 残留，也清命令式路径留下的内容
    const app = Vue.createApp(component, { state });
    app.config.errorHandler = (err) => { console.error("[VuePanelMount]", err); };
    app.mount(body);
    apps.set(body, app);
  }

  function unmount(body) {
    const app = apps.get(body);
    if (!app) return;
    apps.delete(body);
    try {
      app.unmount();
    } catch (err) {
      // 命令式渲染器可能已用 innerHTML 清掉 Vue 的挂载点（如面板在 Vue 挂载期间被别处重绘），
      // 此时 Vue 卸载会走到脱离文档的节点上抛错；DOM 已被清干净，忽略即可。
      if (typeof console !== "undefined" && console.warn) console.warn("[VuePanelMount] unmount skipped:", err.message);
    }
  }

  return { available, mount, unmount };
})();

window.VuePanelMount = VuePanelMount;

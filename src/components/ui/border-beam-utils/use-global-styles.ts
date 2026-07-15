import { useEffect } from "react"

/**
 * Injeta um bloco de CSS global uma única vez (deduplicado por `id`),
 * mesmo com várias instâncias do componente montadas ao mesmo tempo.
 * O <style> é mantido no <head> após o unmount — é compartilhado.
 */
export function useGlobalStyles(css: string, id: string) {
  useEffect(() => {
    if (document.getElementById(id)) return
    const style = document.createElement("style")
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
  }, [css, id])
}

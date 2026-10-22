# Verificações

- `npm test`: cinco testes aprovados, cobrindo validação de sessões, independência de presets, mute/solo, timing com swing e formato PCM.
- `npm run build`: verificação TypeScript e build Vite concluídos. JavaScript: aproximadamente 41,4 KB (15,8 KB gzip); CSS: 22 KB (5,6 KB gzip); fontes locais: 59,2 KB no total.
- Auditoria npm durante a instalação: nenhuma vulnerabilidade reportada.
- Navegador Chromium: iniciar/pausar, edição de passos, abertura do mixer, alteração de swing, solo, filtro de estilo e carregamento de groove.
- Sessão salva, nota editada e solo preservados após recarregar.
- Download WAV real inspecionado: RIFF/WAVE, 44.100 Hz, PCM mono, 220.544 bytes, 2,5 segundos para um compasso em 120 BPM mais cauda. Pico 11.557/32.767 e 15.248 amostras não nulas no teste de pista solo.
- Mobile em 390 × 844: documento com 375 px úteis sem overflow horizontal global; grade rola apenas na região do sequenciador e passos finais continuam acionáveis.
- Teclado: nota permanece focada ao alternar seu estado, inclusive com espaço; modal mantém Tab/Shift+Tab e devolve foco ao fechar com Escape.

A revisão encontrou e corrigiu a perda de foco causada pelo uso de lista com identidade por valor em células booleanas. As células agora são preservadas por posição com `Index`. A parada de áudio desconecta o barramento da reprodução anterior para evitar notas agendadas reaparecendo ao reiniciar.

Não foram medidos escores Lighthouse, feita auditoria assistiva com leitor de tela ou teste em Safari/Firefox e aparelhos físicos. Movimento reduzido está implementado no CSS; a animação é decorativa. Os testes do áudio confirmam o arquivo gerado e o comportamento visual, sem avaliação subjetiva de qualidade musical.

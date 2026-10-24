---
impacto: nada_mudou
secao: corrigido
titulo: Atualização aplica a política de download também no processo
---

Uma política antiga de não baixar imagens podia continuar valendo durante a
atualização, mesmo depois de o arquivo da instalação ser corrigido. Agora o
processo recebe a mesma política gravada no arquivo, evitando a tentativa de
iniciar uma imagem ausente e uma reconstrução desnecessária do aplicativo.

O monitor do n8n também reconhece o marcador completo da versão implantada e o
código de saída do comando, evitando avisar falha quando o deploy terminou bem.

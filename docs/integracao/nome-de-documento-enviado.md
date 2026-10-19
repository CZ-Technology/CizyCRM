# Nome de documentos enviados por integração

Depois de subir um PDF em `POST /api/v1/conversations/{id}/media`, envie a mensagem em `POST /api/v1/messages` com `type: "document"`, o `media_storage_path` devolvido pelo upload e `media_filename` com o nome a mostrar ao destinatário.

```json
{
  "conversation_id": "<id da conversa>",
  "type": "document",
  "media_storage_path": "<storage_path devolvido pelo upload>",
  "media_mime": "application/pdf",
  "media_size_bytes": 178883,
  "media_filename": "Análise Score GMN - Maria Souza.pdf"
}
```

`media_filename` é opcional e aceita até 255 caracteres. Para documentos, o CRM remove caracteres de controle e substitui barras por hífens antes de enviar o nome ao canal e registrá-lo em `messages.metadata.media_filename`, usado pelo Inbox. Se omitido, o envio mantém o nome técnico derivado do caminho no Storage. O arquivo guardado não é renomeado.

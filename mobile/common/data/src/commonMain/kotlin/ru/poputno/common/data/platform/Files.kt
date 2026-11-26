package ru.poputno.common.data.platform

/** Байты локального файла (кадр камеры). Читается вне main-потока. null — файла нет. */
internal expect suspend fun readFileBytes(path: String): ByteArray?

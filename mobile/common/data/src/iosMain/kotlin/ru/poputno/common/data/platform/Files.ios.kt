@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package ru.poputno.common.data.platform

import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.withContext
import platform.Foundation.NSData
import platform.Foundation.dataWithContentsOfFile
import platform.posix.memcpy

internal actual suspend fun readFileBytes(path: String): ByteArray? = withContext(Dispatchers.IO) {
    val data = NSData.dataWithContentsOfFile(path) ?: return@withContext null
    val size = data.length.toInt()
    ByteArray(size).also { out -> if (size > 0) out.usePinned { memcpy(it.addressOf(0), data.bytes, data.length) } }
}

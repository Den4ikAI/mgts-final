package ru.poputno.core.designsystem.tokens

import androidx.compose.ui.graphics.Color

/**
 * Слой 1. Примитивы палитры «Попутно» (зеркало design2/brand/tokens.css).
 * В компонентах и фичах НЕ используются: только через [PpColors].
 * Правило бренда: бренд холодный, тёплые цвета означают ТОЛЬКО состояние объекта.
 */
object PpPalette {
    object Navy {
        val s50 = Color(0xFFEAF1F8); val s100 = Color(0xFFD0DEEC); val s200 = Color(0xFFA5BDD8)
        val s300 = Color(0xFF7699C0); val s400 = Color(0xFF4A78A6); val s500 = Color(0xFF2B5C8C)
        val s600 = Color(0xFF1C4670); val s700 = Color(0xFF123354); val s800 = Color(0xFF0A2540)
        val s850 = Color(0xFF082037); val s900 = Color(0xFF061A2E); val s925 = Color(0xFF05142A)
        val s950 = Color(0xFF030E1C); val s1000 = Color(0xFF020913)
    }
    object Signal {
        val s50 = Color(0xFFEAF4FE); val s100 = Color(0xFFD2E8FD); val s200 = Color(0xFFA6D0FA)
        val s300 = Color(0xFF6FB3F5); val s400 = Color(0xFF3A98EE); val s500 = Color(0xFF0A84E6)
        val s550 = Color(0xFF0576D6); val s600 = Color(0xFF0068C2); val s700 = Color(0xFF00549E)
        val s800 = Color(0xFF03437E); val s900 = Color(0xFF073763); val s950 = Color(0xFF06223F)
    }
    object Scan {
        val s50 = Color(0xFFE8FCFE); val s100 = Color(0xFFC6F6FC); val s200 = Color(0xFF93EEF8)
        val s300 = Color(0xFF5FE5F4); val s400 = Color(0xFF2ADCF0); val s500 = Color(0xFF0FC2DA)
        val s600 = Color(0xFF009EBF); val s700 = Color(0xFF0A7B8E); val s800 = Color(0xFF0E6270)
        val s900 = Color(0xFF10505C); val s950 = Color(0xFF04323B)
    }
    object Slate {
        val s0 = Color(0xFFFFFFFF); val s25 = Color(0xFFF5F8FB); val s50 = Color(0xFFEEF2F6)
        val s100 = Color(0xFFE2E8EF); val s200 = Color(0xFFCDD5DF); val s300 = Color(0xFFAEB9C6)
        val s400 = Color(0xFF8A97A8); val s500 = Color(0xFF6B7889); val s600 = Color(0xFF536072)
        val s700 = Color(0xFF3E4A5A); val s800 = Color(0xFF2A3543); val s850 = Color(0xFF1F2934)
        val s900 = Color(0xFF16202B); val s950 = Color(0xFF0B1520)
    }
    object Ok {
        val s50 = Color(0xFFE8F7F0); val s200 = Color(0xFF94DCBA); val s300 = Color(0xFF5CC895)
        val s400 = Color(0xFF34B87F); val s500 = Color(0xFF1FA971); val s600 = Color(0xFF16885A)
        val s700 = Color(0xFF126C49)
    }
    object Suspected {
        val s50 = Color(0xFFFDF8E6); val s200 = Color(0xFFF5DB82); val s300 = Color(0xFFF0C94D)
        val s400 = Color(0xFFECBD31); val s500 = Color(0xFFE8B520); val s600 = Color(0xFFB88C0F)
        val s700 = Color(0xFF876608)
    }
    object Defect {
        val s50 = Color(0xFFFEF1E6); val s200 = Color(0xFFF8B884); val s300 = Color(0xFFF39A52)
        val s400 = Color(0xFFEF8834); val s500 = Color(0xFFEC7A1C); val s600 = Color(0xFFC45F0E)
        val s700 = Color(0xFF9A4A0C)
    }
    object Critical {
        val s50 = Color(0xFFFDECEC); val s200 = Color(0xFFF4A1A3); val s300 = Color(0xFFEE7275)
        val s400 = Color(0xFFEA5558); val s500 = Color(0xFFE5383B); val s550 = Color(0xFFD42E31)
        val s600 = Color(0xFFC42427); val s700 = Color(0xFF9E1D20); val s800 = Color(0xFF7C1A1C)
    }
}

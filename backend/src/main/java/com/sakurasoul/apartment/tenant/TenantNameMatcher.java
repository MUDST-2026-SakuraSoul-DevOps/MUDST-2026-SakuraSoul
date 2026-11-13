package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.common.Whitespace;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Function;

/**
 * ค้นชื่อผู้เช่าแบบยอมให้พิมพ์ผิด (SSK-174 โบนัส) ตัวอย่างของอาจารย์คือ "krant" หรือ "kart" ต้องเจอ "Kant"
 * <p>
 * เป็นการย้าย frontend/src/domain/tenantSearch.ts มาทีละบรรทัด เพราะหน้าเว็บกับ backend จำลองใช้กฎชุดนั้นอยู่แล้ว
 * ถ้าสองฝั่งคิดไม่เหมือนกัน เทสที่ผ่านบน mock จะไม่บอกอะไรเกี่ยวกับของจริงเลย ซึ่งเป็นสาเหตุที่ endpoint นี้หลุดมาถึง
 * วันก่อนพรีเซนต์โดยไม่มีใครเห็น กฎทั้งหมดอยู่ในหัวข้อ SSK-174 ของ docs/api-contract-lease.md
 * <p>
 * เลือกวิธี B ของการ์ด คือคำนวณระยะแก้ไขในแอป (Damerau-Levenshtein แบบ OSA) ไม่ใช้ pg_trgm ของ PostgreSQL
 * ผู้เช่ามีระดับสิบถึงร้อยคน โหลดชื่อทั้งหมดมาคิดได้สบาย ไม่ต้องมี migration หรือ extension และอธิบายผลได้ตรงตัวว่าผิดกี่ตัว
 * <p>
 * นับความยาวและระยะตาม code point เหมือน {@code [...text]} ของ JavaScript ไม่ใช่ตาม char ของ Java
 * สระบน/ล่างและวรรณยุกต์ไทยจึงนับเป็นหนึ่งตัวแยกจากพยัญชนะ พิมพ์วรรณยุกต์ผิดหรือขาดนับเป็นผิดหนึ่งตัว
 */
public final class TenantNameMatcher {

    public static final int MAX_RESULTS = 20;

    /**
     * ตัวตัดสินสุดท้ายเมื่อระดับและระยะเท่ากัน หน้าเว็บใช้ localeCompare ซึ่งเรียงตาม ICU
     * ฝั่งนี้ไม่ใช้ java.text.Collator เพราะค่าตั้งต้นของมันมองข้ามช่องว่าง "Kant Srisuk" กับ "Kanta Li" จึงสลับลำดับกับหน้าเว็บ
     * และกฎภาษาไทยขึ้นกับข้อมูล locale ที่ติดมากับ JRE ใช้ตัวพิมพ์เล็กใหญ่ไม่สนก่อนแล้วตามรหัสตัวอักษรแทน
     * ผลต่างจากหน้าเว็บได้แค่ชื่อไทยที่ขึ้นต้นด้วยสระหน้า (เ แ โ ใ ไ) กับตัวอักษรที่มีเครื่องหมาย ซึ่งเป็นแค่ลำดับชั้นที่สาม
     */
    private static final Comparator<String> BY_NAME =
            String.CASE_INSENSITIVE_ORDER.thenComparing(Comparator.naturalOrder());

    private TenantNameMatcher() {
    }

    /** ผลของชื่อหนึ่งชื่อ distance เป็น 0 สำหรับแบบตรง ขึ้นต้น และมีอยู่ในชื่อ */
    public record NameMatch(TenantMatch match, int distance) {
    }

    /** ผู้เช่าหนึ่งคนที่ผ่านเกณฑ์ พร้อมระดับความตรง */
    public record Ranked<T>(T item, TenantMatch match) {
    }

    private record Hit<T>(T item, String fullName, NameMatch result) {
    }

    /** NFC → ตัดหัวท้าย → ตัวพิมพ์เล็ก → ยุบช่องว่างซ้ำ ลำดับเดียวกับ normalize ของหน้าเว็บ */
    public static String normalize(String text) {
        String composed = Normalizer.normalize(text, Normalizer.Form.NFC);
        // Locale.ROOT กันเครื่องที่ตั้ง locale เป็นตุรกี ซึ่งจะแปลง I เป็น ı แล้วค้น "KIM" ไม่เจอ Kim
        return Whitespace.collapse(Whitespace.trim(composed).toLowerCase(Locale.ROOT));
    }

    /** ระยะแก้ไขแบบ OSA นับการสลับตัวอักษรติดกันเป็นหนึ่งครั้ง เช่น "knat" กับ "kant" */
    public static int editDistance(String a, String b) {
        int[] x = a.codePoints().toArray();
        int[] y = b.codePoints().toArray();
        int[][] d = new int[x.length + 1][y.length + 1];
        for (int i = 0; i <= x.length; i++) {
            d[i][0] = i;
        }
        for (int j = 0; j <= y.length; j++) {
            d[0][j] = j;
        }
        for (int i = 1; i <= x.length; i++) {
            for (int j = 1; j <= y.length; j++) {
                int cost = x[i - 1] == y[j - 1] ? 0 : 1;
                d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && x[i - 1] == y[j - 2] && x[i - 2] == y[j - 1]) {
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
                }
            }
        }
        return d[x.length][y.length];
    }

    /** คำค้นสั้นกว่า 3 ตัวไม่หาแบบคล้าย (ไม่งั้น "ab" เจอแทบทุกคน) 3-6 ตัวยอมผิด 1 ตัว 7 ตัวขึ้นไปยอม 2 ตัว */
    public static int allowedEdits(String query) {
        int length = query.codePointCount(0, query.length());
        return length < 3 ? 0 : length < 7 ? 1 : 2;
    }

    /**
     * ผลของชื่อหนึ่งชื่อ หรือว่างถ้าไม่ผ่านเกณฑ์ เทียบทีละคำของชื่อด้วย ไม่ใช่แค่ทั้งชื่อ
     * เพราะคนมักพิมพ์แค่ชื่อต้น ส่วนคำค้นที่มีจุดหรือดอกจันถือเป็นตัวอักษรธรรมดา ไม่ใช่ regex
     */
    public static Optional<NameMatch> matchName(String fullName, String rawQuery) {
        String query = normalize(rawQuery);
        if (query.isEmpty()) {
            return Optional.empty();
        }
        String name = normalize(fullName);
        List<String> words = List.of(name.split(" "));
        if (name.equals(query) || words.contains(query)) {
            return Optional.of(new NameMatch(TenantMatch.EXACT, 0));
        }
        if (name.startsWith(query) || words.stream().anyMatch(word -> word.startsWith(query))) {
            return Optional.of(new NameMatch(TenantMatch.PREFIX, 0));
        }
        if (name.contains(query)) {
            return Optional.of(new NameMatch(TenantMatch.CONTAINS, 0));
        }
        int limit = allowedEdits(query);
        if (limit == 0) {
            return Optional.empty();
        }
        List<String> candidates = new ArrayList<>(words.size() + 1);
        candidates.add(name);
        candidates.addAll(words);
        int queryLength = query.codePointCount(0, query.length());
        int best = Integer.MAX_VALUE;
        for (String candidate : candidates) {
            // ระยะแก้ไขไม่มีทางต่ำกว่าผลต่างของความยาว คำที่ยาวต่างเกินเกณฑ์จึงข้ามได้โดยผลไม่เปลี่ยน
            // กันคำค้นยาวผิดปกติไม่ให้ต้องคิดตารางใหญ่กับทุกคนในระบบ
            int lengthGap = Math.abs(queryLength - candidate.codePointCount(0, candidate.length()));
            if (lengthGap <= limit) {
                best = Math.min(best, editDistance(query, candidate));
            }
        }
        return best <= limit ? Optional.of(new NameMatch(TenantMatch.SIMILAR, best)) : Optional.empty();
    }

    /**
     * เรียงคนที่ผ่านเกณฑ์: ระดับความตรง แล้วตามระยะแก้ไข แล้วตามชื่อ ตัดไว้ไม่เกิน {@link #MAX_RESULTS} คน
     * การเรียงเป็นแบบ stable เหมือน Array.prototype.sort คนที่เท่ากันทุกเกณฑ์จึงคงลำดับที่ส่งเข้ามา
     */
    public static <T> List<Ranked<T>> rank(List<T> people, Function<T, String> nameOf, String query) {
        Comparator<Hit<T>> order = Comparator
                .<Hit<T>>comparingInt(hit -> hit.result().match().ordinal())
                .thenComparingInt(hit -> hit.result().distance())
                .thenComparing(Hit::fullName, BY_NAME);
        return people.stream()
                .flatMap(person -> {
                    String fullName = nameOf.apply(person);
                    return matchName(fullName, query).map(result -> new Hit<>(person, fullName, result)).stream();
                })
                .sorted(order)
                .limit(MAX_RESULTS)
                .map(hit -> new Ranked<>(hit.item(), hit.result().match()))
                .toList();
    }
}

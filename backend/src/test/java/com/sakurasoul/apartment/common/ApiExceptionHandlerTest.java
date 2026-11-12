package com.sakurasoul.apartment.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ไฟล์ที่ใหญ่เกินเพดานของ Spring ถูกตีกลับก่อนถึง controller MockMvc ไม่ใช้เพดานนี้ เทสของ API จึงไปไม่ถึงตรงนี้
 * ทดสอบ handler ตรง ๆ แทน ส่วนของจริงลองกับ docker compose ตอนตรวจของจริง
 */
class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    @DisplayName("SSK-161 ไฟล์เกินเพดานของ Spring ได้ 413 ข้อความตามเพดานของ endpoint นั้น")
    void theUploadLimitMessageFollowsTheEndpoint() {
        assertThat(detailFor("/api/attachments")).isEqualTo("The file is larger than 5 MB");
        assertThat(detailFor("/api/documents")).isEqualTo("The file is larger than 5 MB");
        assertThat(detailFor("/api/meter-readings/import")).isEqualTo("The file is larger than 1 MB");
    }

    private String detailFor(String path) {
        ResponseEntity<Object> response = handler.handleMaxUploadSizeExceededException(
                new MaxUploadSizeExceededException(6 * 1024 * 1024), new HttpHeaders(), HttpStatus.CONTENT_TOO_LARGE,
                new ServletWebRequest(new MockHttpServletRequest("POST", path)));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONTENT_TOO_LARGE);
        return ((ProblemDetail) response.getBody()).getDetail();
    }
}

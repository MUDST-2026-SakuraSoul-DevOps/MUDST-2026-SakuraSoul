package com.sakurasoul.apartment.common;

public class NotFoundException extends RuntimeException {

    public NotFoundException(String what, Object id) {
        super("ไม่พบ" + what + " id " + id);
    }
}

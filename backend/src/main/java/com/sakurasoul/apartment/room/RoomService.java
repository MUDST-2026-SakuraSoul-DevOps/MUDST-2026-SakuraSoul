package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.common.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class RoomService {

    private final RoomRepository roomRepository;

    public RoomService(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    /** ห้องทั้ง 24 ห้องเรียงตามเลขห้อง ใช้เลี้ยงหน้าผังห้อง */
    @Transactional(readOnly = true)
    public List<RoomSummaryResponse> listRooms() {
        return roomRepository.findAllByOrderByRoomNumberAsc().stream()
                .map(RoomSummaryResponse::of)
                .toList();
    }

    @Transactional(readOnly = true)
    public RoomDetailResponse getRoom(Long id) {
        return roomRepository.findById(id)
                .map(RoomDetailResponse::of)
                .orElseThrow(() -> new NotFoundException("ห้อง", id));
    }
}

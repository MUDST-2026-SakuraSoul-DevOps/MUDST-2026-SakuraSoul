package com.sakurasoul.apartment.room;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RoomRepository extends JpaRepository<Room, Long> {

    List<Room> findAllByOrderByRoomNumberAsc();

    Optional<Room> findByRoomNumber(String roomNumber);
}

package com.sakurasoul.apartment;

import org.springframework.boot.SpringApplication;

public class TestApartmentApplication {

	public static void main(String[] args) {
		SpringApplication.from(ApartmentApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}

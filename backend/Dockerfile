# ---------- build ----------
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /workspace

# copy เฉพาะไฟล์ที่เกี่ยวกับ dependency ก่อน layer นี้จะได้ถูก cache ไว้
# ตราบใดที่ build.gradle ไม่เปลี่ยน แก้โค้ดแล้ว build ใหม่จะไม่ต้องโหลด dependency ซ้ำ
COPY gradle gradle
COPY gradlew build.gradle settings.gradle ./
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true

COPY src src
# ข้ามเทสตอน build image เพราะ Testcontainers ต้องใช้ Docker ซ้อนใน Docker
# เทสรันใน CI ก่อนถึงขั้นตอนนี้อยู่แล้ว
RUN ./gradlew --no-daemon bootJar -x test

# ---------- runtime ----------
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app

COPY --from=build /workspace/build/libs/*.jar app.jar
RUN chown -R app:app /app
USER app

EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]

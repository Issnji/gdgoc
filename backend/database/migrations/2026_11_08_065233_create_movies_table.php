<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('movies', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('title');
            $table->unsignedSmallInteger('year');
            $table->string('director');
            $table->json('genres');
            $table->decimal('rating', 3, 1)->nullable();
            $table->string('duration', 30)->nullable();
            $table->text('synopsis');
            $table->text('poster_url')->nullable();
            $table->json('cast');
            $table->index('title');
            $table->index('year');
        });
    }
    public function down(): void { Schema::dropIfExists('movies'); }
};

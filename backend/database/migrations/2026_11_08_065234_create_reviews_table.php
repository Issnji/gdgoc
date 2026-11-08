<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('movie_id')->constrained()->onDelete('cascade');
            $table->unsignedTinyInteger('rating');
            $table->text('review')->nullable();
            $table->timestamp('watched_at')->useCurrent();
            $table->timestamps();
            $table->unique(['user_id', 'movie_id']);
            $table->index(['user_id', 'watched_at']);
        });
    }
    public function down(): void { Schema::dropIfExists('reviews'); }
};

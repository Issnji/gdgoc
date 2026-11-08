<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    protected $fillable = ['user_id', 'movie_id', 'rating', 'review', 'watched_at'];
    protected function casts(): array { return ['watched_at' => 'datetime']; }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function movie(): BelongsTo { return $this->belongsTo(Movie::class); }
}

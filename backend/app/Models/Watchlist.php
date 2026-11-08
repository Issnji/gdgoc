<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Watchlist extends Model
{
    public $timestamps = false;
    protected $fillable = ['user_id', 'movie_id', 'created_at'];

    protected function casts(): array { return ['created_at' => 'datetime']; }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function movie(): BelongsTo { return $this->belongsTo(Movie::class); }
}
